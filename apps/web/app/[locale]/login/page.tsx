"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
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
              className="block rounded-md border border-gray-300 bg-white px-3 py-1.5 text-center text-sm font-medium text-gray-800 hover:bg-gray-100"
            >
              {t("auth.sso.google")}
            </a>
            <a
              href={`${API_BASE}/api/v1/auth/oauth/apple/start`}
              className="block rounded-md border border-gray-300 bg-white px-3 py-1.5 text-center text-sm font-medium text-gray-800 hover:bg-gray-100"
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
