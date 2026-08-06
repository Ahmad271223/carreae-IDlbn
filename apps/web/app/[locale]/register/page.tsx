"use client";
import { useState } from "react";
import Link from "next/link";
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
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
