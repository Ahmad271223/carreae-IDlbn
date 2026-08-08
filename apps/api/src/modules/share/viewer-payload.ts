/**
 * The account-less viewer projection (§34/§5, §65 test 13). This type IS the
 * security boundary: there is no verification-status field anywhere in it.
 * A verified fact carries `verifiedBy`; an unverified fact carries nothing.
 * PENDING/DECLINED/EXPIRED/REVOKED are structurally unrepresentable.
 *
 * The single deliberate exception: an attached CREDENTIAL shows its CURRENT
 * lifecycle status (§34 — a recipient must see a revocation immediately).
 */
export interface ViewerBadge {
  verifiedBy: string;
  verifiedAt: string;
}

export interface ViewerEntry {
  title: string;
  subtitle?: string;
  dateRange?: string;
  description?: string;
  badge?: ViewerBadge;
}

export interface ViewerCredential {
  credentialType: string;
  issuer: string;
  issuedAt: string;
  /** LIVE lifecycle status — ACTIVE | EXPIRED | REVOKED | SUPERSEDED. */
  status: string;
  payload: Record<string, unknown>;
}

export interface ViewerDocument {
  id: string;
  fileName: string;
  category: string;
  downloadable: boolean;
}

export interface ViewerLetter {
  title: string;
  paragraphs: string[];
}

/** Non-PII provenance shown in the viewer chrome (title is applicant-authored). */
export interface ViewerMeta {
  applicationTitle: string;
  sharedAt: string;
  expiresAt: string | null;
  viewCount: number;
}

export interface ViewerPayload {
  applicant: { name: string; headline?: string };
  meta: ViewerMeta;
  sections: Partial<
    Record<"experience" | "education" | "languages" | "skills", ViewerEntry[]>
  >;
  credentials: ViewerCredential[];
  documents: ViewerDocument[];
  coverLetters: ViewerLetter[];
}
