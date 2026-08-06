"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../../lib/api";
import { useT } from "../../../lib/i18n-client";
import { Button, Card, ErrorText, Field, Input } from "../../../components/ui";

export default function LoginPage() {
  const { locale, t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { method: "POST", body: { email, password } });
      router.push(`/${locale}/dashboard`);
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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
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
        <p className="mt-3 text-sm text-gray-600">
          {t("auth.noAccount")}{" "}
          <Link className="text-brand underline" href={`/${locale}/register`}>
            {t("auth.register")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
