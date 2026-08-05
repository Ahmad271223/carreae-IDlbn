import { UnauthorizedException } from "@nestjs/common";
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";
import { OidcClient, OidcProfile } from "./oidc-client";

const AUTH_ENDPOINT = "https://appleid.apple.com/auth/authorize";
const TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
const ISSUER = "https://appleid.apple.com";
const JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export interface AppleOidcConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  /** PKCS#8 PEM of the ES256 signing key from the Apple developer portal. */
  privateKeyPem: string;
}

export class AppleOidcClient extends OidcClient {
  constructor(private readonly config: AppleOidcConfig) {
    super();
  }

  authorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email",
      // Apple mandates form_post when scopes are requested — the callback
      // route therefore accepts POST as well as GET.
      response_mode: "form_post",
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OidcProfile> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: await this.clientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) {
      throw new UnauthorizedException({ code: "OAUTH_EXCHANGE_FAILED" });
    }
    const body = (await response.json()) as { id_token?: string };
    if (!body.id_token) {
      throw new UnauthorizedException({ code: "OAUTH_EXCHANGE_FAILED" });
    }
    const { payload } = await jwtVerify(body.id_token, JWKS, {
      issuer: ISSUER,
      audience: this.config.clientId,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new UnauthorizedException({ code: "OAUTH_PROFILE_INCOMPLETE" });
    }
    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      // Apple sends this as boolean or the string "true" depending on flow.
      emailVerified:
        payload.email_verified === true || payload.email_verified === "true",
    };
  }

  /** Apple's "client secret" is a short-lived ES256 JWT signed by our key. */
  private async clientSecret(): Promise<string> {
    const key = await importPKCS8(this.config.privateKeyPem, "ES256");
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setSubject(this.config.clientId)
      .setAudience(ISSUER)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
  }
}
