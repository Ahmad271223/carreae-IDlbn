import { randomBytes } from "node:crypto";

/** Unambiguous base32 alphabet (no 0/o, 1/l/i) for slug suffixes. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function slugSuffix(length = 5): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/**
 * Latin-normalizes a display name for the public handle. Names without any
 * latin-representable characters (e.g. purely Arabic script) fall back to a
 * neutral base — the slug is cosmetic, never an identifier or a claim.
 */
export function slugBase(firstName: string, lastName: string): string {
  const base = `${firstName} ${lastName}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "user";
}

export function buildSlug(firstName: string, lastName: string): string {
  return `${slugBase(firstName, lastName)}-${slugSuffix()}`;
}
