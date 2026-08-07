"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { branding } from "@careerid/branding";
import { api, ApiError, API_BASE } from "../../../lib/api";
import { useT } from "../../../lib/i18n-client";
import { Button, Card, ErrorText, Field, Input } from "../../../components/ui";

interface LoginResult {
  mfaRequired?: boolean;
  challengeToken?: string;
}

export default function LoginPage() {
  const { locale, t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<LoginResult>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      // §MFA: a challenge means no session yet — collect the TOTP code first.
      if (result.mfaRequired && result.challengeToken) {
        setChallengeToken(result.challengeToken);
      } else {
        router.push(`/${locale}/dashboard`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t("auth.invalidCredentials")
          : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/mfa/verify", {
        method: "POST",
        body: { challengeToken, code },
      });
      router.push(`/${locale}/dashboard`);
    } catch {
      setError(t("auth.mfaInvalid"));
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
      {challengeToken ? (
        <Card title={t("auth.mfaTitle")}>
          <form onSubmit={submitCode} className="space-y-3">
            <p className="text-sm text-gray-600">{t("auth.mfaPrompt")}</p>
            <Field label={t("auth.mfaCode")}>
              <Input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                required
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {t("auth.login")}
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>
        </Card>
      ) : (
        <Card title={t("auth.login")}>
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {t("auth.login")}
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>

          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
            <p className="text-center text-xs text-gray-400">{t("auth.orContinue")}</p>
            <a
              href={`${API_BASE}/api/v1/auth/oauth/google/start`}
              className="block rounded-xl border border-line bg-white px-3.5 py-2.5 text-center text-sm font-semibold text-brand transition-colors hover:border-brand-tint/50 hover:bg-brand-soft"
            >
              {t("auth.sso.google")}
            </a>
            <a
              href={`${API_BASE}/api/v1/auth/oauth/apple/start`}
              className="block rounded-xl border border-line bg-white px-3.5 py-2.5 text-center text-sm font-semibold text-brand transition-colors hover:border-brand-tint/50 hover:bg-brand-soft"
            >
              {t("auth.sso.apple")}
            </a>
          </div>

          <p className="mt-3 text-sm text-gray-600">
            {t("auth.noAccount")}{" "}
            <Link className="text-brand underline" href={`/${locale}/register`}>
              {t("auth.register")}
            </Link>
          </p>
        </Card>
      )}
    </main>
  );
}
