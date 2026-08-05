import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-layer encryption for sensitive columns (TOTP secrets, contact
 * data — SECURITY.md §4). AES-256-GCM with a random 96-bit IV per value.
 * Payload format is versioned ("v1:...") so the key/algorithm can rotate.
 */

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set (32 bytes, base64-encoded)");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [version, ivB64, ciphertextB64, tagB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !ciphertextB64 || !tagB64) {
    throw new Error("Unsupported encrypted payload format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    loadKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
