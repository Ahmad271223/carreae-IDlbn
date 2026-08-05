/**
 * Magic-byte MIME detection — file extensions are NEVER trusted (SECURITY.md).
 * The allow-list is deliberately small for the MVP wallet; anything else is
 * rejected at upload completion.
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function sniffMimeType(buffer: Buffer): AllowedMimeType | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  if (
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString("latin1") === "PNG" &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
