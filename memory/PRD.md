# Career ID — Design Uplift

## Request
User: "mach design hochwertiger" (make the design higher quality) — budget-constrained (8 credits).

## Done (June 2026)
- Rebuilt design tokens in apps/web/app/globals.css: display font (Bricolage Grotesque) + body (Manrope) + IBM Plex Sans Arabic for RTL; ink-navy brand, teal verified accent, brass premium accent; textured gradient canvas, selection styling, focus-visible rings, rise animation, glass surface + primary-button classes.
- Elevated shared UI (components/ui.tsx): premium Button (gradient/press), Input (focus glow), Card (glass), VerifiedBadge & ErrorText with inline SVG icons.
- Redesigned landing page: brand mark, language pill switcher, animated hero, CTA row, 3 feature cards, footer (all logical/RTL-safe).
- Auth pages (login/register): branded header + card layout.
- App shell header: sticky glass bar, brand mark, refined active nav pills.

## Notes
- Monorepo is Phase-0 scaffold; not runnable in preview (needs Docker/Postgres). Changes verified at code level, not via live render.
- §5 preserved: only verified data carries the positive accent; unverified never error-styled.

## Update (June 2026) — Portal + Share uplift
- Wallet, Credentials, CVs: display-font headings, premium selects/rows, brand-soft payload panels, refined status badges (verified = teal, revoked = red, else neutral brand tint).
- Share/verification view fully redesigned as trust highlight: provenance bar with shield mark + verified chip, applicant hero card with gradient + initials avatar, trust banner (i18n verification.trust with graceful fallback), glass section cards, SVG verified badges, premium document rows + download button, brand footer.
- All RTL-safe (logical utilities); §5 preserved (verified-only positive accent).
- Still Phase-0 scaffold: not live-rendered (needs Docker/Postgres).
