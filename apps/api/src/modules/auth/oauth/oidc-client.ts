/** What an identity provider tells us about the authenticated person. */
export interface OidcProfile {
  /** Stable provider-scoped subject identifier. */
  subject: string;
  email: string;
  emailVerified: boolean;
}

export type OidcProviderKey = "google" | "apple";

/**
 * Minimal OIDC authorization-code client. Implementations verify the ID token
 * signature against the provider's JWKS — we never trust unverified claims.
 */
export abstract class OidcClient {
  abstract authorizationUrl(state: string, redirectUri: string): string;
  abstract exchangeCode(code: string, redirectUri: string): Promise<OidcProfile>;
}

/** DI token for the configured provider map (providers without env config are absent). */
export const OIDC_CLIENTS = "OIDC_CLIENTS";
export type OidcClientMap = Partial<Record<OidcProviderKey, OidcClient>>;
