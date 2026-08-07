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
