import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_LOCALES } from "@careerid/i18n";

/**
 * Prefixes every page path with a locale segment. Default is English until
 * per-user locale negotiation ships with the authenticated shell.
 */
export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  const hasLocale = (SUPPORTED_LOCALES as readonly string[]).some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (!hasLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/en${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }
  return undefined;
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
