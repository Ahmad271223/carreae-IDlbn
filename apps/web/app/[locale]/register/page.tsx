"use client";
import { useState } from "react";
import Link from "next/link";
import { branding } from "@careerid/branding";
import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n-client";
import { Button, Card, ErrorText, Field, Input } from "../../../components/ui";

export default function RegisterPage() {
  const { locale, t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/register", {
        method: "POST",
        body: { email, password, locale },
      });
      setDone(true);
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <Link href={`/${locale}`} className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-brand-tint to-brand text-white shadow-[0_8px_20px_-8px_rgba(20,36,61,0.6)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="font-display text-lg font-bold tracking-tight text-brand">
          {branding.productName}
        </span>
      </Link>
      <Card title={t("auth.register")}>
        {done ? (
          <p className="text-sm text-gray-700">{t("auth.checkInbox")}</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Field label={t("auth.email")}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label={t("auth.password")}>
              <Input
                type="password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {t("auth.register")}
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>
        )}
        <p className="mt-3 text-sm text-gray-600">
          {t("auth.haveAccount")}{" "}
          <Link className="text-brand underline" href={`/${locale}/login`}>
            {t("auth.login")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
