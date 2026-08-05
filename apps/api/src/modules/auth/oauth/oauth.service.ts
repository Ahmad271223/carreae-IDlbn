import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { IdentityProvider, User } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { generateToken, sha256Hex } from "../../../common/crypto";
import { AuditService } from "../../audit/audit.service";
import { AuthService } from "../auth.service";
import { AppleOidcClient } from "./apple-oidc.client";
import { GoogleOidcClient } from "./google-oidc.client";
import {
  OIDC_CLIENTS,
  OidcClient,
  OidcClientMap,
  OidcProviderKey,
} from "./oidc-client";

const STATE_TTL_MS = 10 * 60 * 1000;

export type CallbackResult =
  | { kind: "session"; sessionToken: string; user: User }
  | { kind: "conflict" } // email exists, no auto-link (SECURITY.md §2)
  | { kind: "linked"; provider: OidcProviderKey };

@Injectable()
export class OauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    @Inject(OIDC_CLIENTS) private readonly clients: OidcClientMap,
  ) {}

  /** Begins the code flow; purpose LINK binds the state to the current user. */
  async start(
    providerKey: string,
    purpose: "LOGIN" | "LINK",
    userId?: string,
  ): Promise<{ url: string }> {
    const { key, client } = this.resolveClient(providerKey);
    const state = generateToken();
    await this.prisma.oauthState.create({
      data: {
        stateHash: sha256Hex(state),
        provider: this.toIdentityProvider(key),
        purpose,
        userId: purpose === "LINK" ? (userId ?? null) : null,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    return { url: client.authorizationUrl(state, this.redirectUri(key)) };
  }

  async handleCallback(
    providerKey: string,
    code: string,
    state: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<CallbackResult> {
    const { key, client } = this.resolveClient(providerKey);
    const provider = this.toIdentityProvider(key);
    const now = new Date();

    // State validates the round trip (CSRF/replay); single-use.
    const stateRow = await this.prisma.oauthState.findUnique({
      where: { stateHash: sha256Hex(state) },
    });
    if (
      !stateRow ||
      stateRow.provider !== provider ||
      stateRow.usedAt ||
      stateRow.expiresAt <= now
    ) {
      throw new BadRequestException({ code: "OAUTH_STATE_INVALID" });
    }
    await this.prisma.oauthState.update({
      where: { id: stateRow.id },
      data: { usedAt: now },
    });

    const profile = await client.exchangeCode(code, this.redirectUri(key));

    if (stateRow.purpose === "LINK") {
      return this.link(provider, key, stateRow.userId, profile.subject);
    }

    // LOGIN: existing identity wins; otherwise a fresh account — but never a
    // silent link onto an existing email (explicit confirmation required).
    const identity = await this.prisma.identity.findUnique({
      where: {
        provider_providerSubject: { provider, providerSubject: profile.subject },
      },
      include: { user: true },
    });
    if (identity) {
      if (identity.user.status !== "ACTIVE") {
        throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
      }
      const sessionToken = await this.auth.openSession(identity.user, meta, {
        sso: key,
      });
      return { kind: "session", sessionToken, user: identity.user };
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (existingByEmail) {
      await this.audit.append({
        actorType: "SYSTEM",
        action: "auth.sso_link_refused",
        targetType: "user",
        targetId: existingByEmail.id,
        metadata: { provider: key },
      });
      return { kind: "conflict" };
    }

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        emailVerifiedAt: profile.emailVerified ? now : null,
        identities: {
          create: { provider, providerSubject: profile.subject },
        },
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: user.id,
      action: "user.registered",
      targetType: "user",
      targetId: user.id,
      metadata: { via: key },
    });
    const sessionToken = await this.auth.openSession(user, meta, { sso: key });
    return { kind: "session", sessionToken, user };
  }

  private async link(
    provider: IdentityProvider,
    key: OidcProviderKey,
    userId: string | null,
    subject: string,
  ): Promise<CallbackResult> {
    if (!userId) throw new BadRequestException({ code: "OAUTH_STATE_INVALID" });
    const existing = await this.prisma.identity.findUnique({
      where: {
        provider_providerSubject: { provider, providerSubject: subject },
      },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException({ code: "IDENTITY_ALREADY_LINKED" });
    }
    if (!existing) {
      await this.prisma.identity.create({
        data: { userId, provider, providerSubject: subject },
      });
      await this.audit.append({
        actorType: "USER",
        actorId: userId,
        action: "auth.sso_linked",
        targetType: "user",
        targetId: userId,
        metadata: { provider: key },
      });
    }
    return { kind: "linked", provider: key };
  }

  private resolveClient(providerKey: string): {
    key: OidcProviderKey;
    client: OidcClient;
  } {
    if (providerKey !== "google" && providerKey !== "apple") {
      throw new NotFoundException({ code: "UNKNOWN_PROVIDER" });
    }
    const client = this.clients[providerKey];
    if (!client) {
      // Honest: provider not configured in this environment — not a fake flow.
      throw new ServiceUnavailableException({ code: "PROVIDER_NOT_CONFIGURED" });
    }
    return { key: providerKey, client };
  }

  private redirectUri(key: OidcProviderKey): string {
    const base = process.env.API_BASE_URL ?? "http://localhost:3001";
    return `${base}/api/v1/auth/oauth/${key}/callback`;
  }

  private toIdentityProvider(key: OidcProviderKey): IdentityProvider {
    return key === "google" ? "GOOGLE" : "APPLE";
  }
}

/** Builds the provider map from environment; unconfigured providers are absent. */
export function buildOidcClients(): OidcClientMap {
  const map: OidcClientMap = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    map.google = new GoogleOidcClient(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
  }
  if (
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY
  ) {
    map.apple = new AppleOidcClient({
      clientId: process.env.APPLE_CLIENT_ID,
      teamId: process.env.APPLE_TEAM_ID,
      keyId: process.env.APPLE_KEY_ID,
      privateKeyPem: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
  }
  return map;
}
