import { UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { OidcClient, OidcProfile } from "./oidc-client";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export class GoogleOidcClient extends OidcClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    super();
  }

  authorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email",
      state,
      prompt: "select_account",
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OidcProfile> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
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
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: this.clientId,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new UnauthorizedException({ code: "OAUTH_PROFILE_INCOMPLETE" });
    }
    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
    };
  }
}
