"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { branding } from "@careerid/branding";
import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n-client";

const NAV = [
  ["dashboard", "nav.dashboard"],
  ["profile", "nav.profile"],
  ["wallet", "nav.wallet"],
  ["cvs", "nav.cvs"],
  ["letters", "nav.letters"],
  ["credentials", "nav.credentials"],
  ["applications", "nav.applications"],
  ["notifications", "nav.notifications"],
  ["org", "nav.org"],
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const { locale, t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api("/auth/me")
      .then(() => setReady(true))
      .catch(() => router.replace(`/${locale}/login`));
  }, [locale, router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace(`/${locale}/login`);
  }

  if (!ready) {
    return <main className="p-8 text-sm text-gray-500">…</main>;
  }
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-b from-brand-tint to-brand text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display font-bold tracking-tight text-brand">{branding.productName}</span>
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
            {NAV.map(([slug, key]) => (
              <Link
                key={slug}
                href={`/${locale}/${slug}`}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-colors ${
                  pathname?.includes(`/${slug}`)
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:bg-brand-soft hover:text-brand"
                }`}
              >
                {t(key)}
              </Link>
            ))}
          </nav>
          <Link
            href={`/${locale}/settings/security`}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            {t("nav.security")}
          </Link>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            {t("nav.logout")}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}
