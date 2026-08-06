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
  ["applications", "nav.applications"],
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
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="font-bold text-brand">{branding.productName}</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
            {NAV.map(([slug, key]) => (
              <Link
                key={slug}
                href={`/${locale}/${slug}`}
                className={`rounded-md px-2 py-1 ${
                  pathname?.includes(`/${slug}`)
                    ? "bg-brand/10 font-medium text-brand"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t(key)}
              </Link>
            ))}
          </nav>
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
