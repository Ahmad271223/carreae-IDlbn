import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  KeyObject,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { canonicalJson } from "../../common/canonical";
import { sha256Hex } from "../../common/crypto";

/** The exact fields a credential signature covers. */
export interface SigningDocument {
  id: string;
  issuerOrganizationId: string;
  subjectUserId: string;
  credentialType: string;
  payload: unknown;
  issuedAt: string; // ISO 8601
  expiresAt: string | null;
}

export interface CredentialSignature {
  alg: "Ed25519";
  keyId: string;
  signature: string; // base64
}

/**
 * Platform-level Ed25519 signing over RFC-8785-style canonical JSON
 * (ARCHITECTURE §4.2). Per-issuer keys and W3C-VC alignment come later; the
 * versioned keyId keeps rotation and that migration possible. Fails closed
 * when no key is configured.
 */
@Injectable()
export class SigningService {
  private privateKey: KeyObject | null = null;
  private publicKey: KeyObject | null = null;
  private keyId = "";

  constructor() {
    const pem = process.env.CREDENTIAL_SIGNING_KEY?.replace(/\\n/g, "\n");
    if (pem) {
      this.privateKey = createPrivateKey(pem);
      this.publicKey = createPublicKey(this.privateKey);
      const der = this.publicKey.export({ type: "spki", format: "der" });
      this.keyId = `ed25519-${sha256Hex(der as Buffer).slice(0, 16)}`;
    }
  }

  get configured(): boolean {
    return this.privateKey !== null;
  }

  sign(doc: SigningDocument): CredentialSignature {
    if (!this.privateKey) {
      throw new ServiceUnavailableException({ code: "SIGNING_UNAVAILABLE" });
    }
    const signature = edSign(
      null,
      Buffer.from(canonicalJson(doc), "utf8"),
      this.privateKey,
    ).toString("base64");
    return { alg: "Ed25519", keyId: this.keyId, signature };
  }

  verify(doc: SigningDocument, signature: CredentialSignature): boolean {
    if (!this.publicKey || signature.alg !== "Ed25519") return false;
    try {
      return edVerify(
        null,
        Buffer.from(canonicalJson(doc), "utf8"),
        this.publicKey,
        Buffer.from(signature.signature, "base64"),
      );
    } catch {
      return false;
    }
  }
}
