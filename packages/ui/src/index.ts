/**
 * @careerid/ui — design tokens. Component library (shadcn-based) lands with the
 * profile UI milestone; tokens are defined first because the verification color
 * rules are product rules, not styling taste (PRODUCT_REQUIREMENTS §5):
 *
 *  - verified gets a positive accent,
 *  - unverified is NEUTRAL — never red, never warning-shaped.
 */
export const tokens = {
  color: {
    /** Positive accent reserved exclusively for verified credentials/badges. */
    verified: "#0f766e",
    verifiedForeground: "#ffffff",
    /** Neutral for self-declared entries — must never read as an error state. */
    neutral: "#6b7280",
    neutralSurface: "#f3f4f6",
    /** Base palette: clean, trustworthy, fintech-adjacent. */
    primary: "#1e3a5f",
    background: "#ffffff",
    foreground: "#111827",
    danger: "#b91c1c",
  },
  radius: {
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
  },
} as const;

export type Tokens = typeof tokens;
