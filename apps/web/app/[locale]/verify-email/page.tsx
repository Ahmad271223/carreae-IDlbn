"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n-client";
import { Card } from "../../../components/ui";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const { locale, t } = useT();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"pending" | "ok" | "failed">("pending");

  useEffect(() => {
    if (!token) {
      setState("failed");
      return;
    }
    api("/auth/verify-email", { method: "POST", body: { token } })
      .then(() => setState("ok"))
      .catch(() => setState("failed"));
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Card title={t("auth.verifyTitle")}>
        {state === "pending" && <p className="text-sm">{t("common.loading")}</p>}
        {state === "ok" && (
          <p className="text-sm text-verified">{t("auth.verifySuccess")}</p>
        )}
        {state === "failed" && (
          <p className="text-sm text-red-700">{t("auth.verifyFailed")}</p>
        )}
        <p className="mt-3 text-sm">
          <Link className="text-brand underline" href={`/${locale}/login`}>
            {t("auth.login")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
