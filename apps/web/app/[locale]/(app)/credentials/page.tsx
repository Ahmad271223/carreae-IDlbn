"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Button, Card, ErrorText, VerifiedBadge } from "../../../../components/ui";

type PayloadValue = string | number | boolean | null;
interface Credential {
  id: string;
  credentialType: string;
  status: string;
  payload: Record<string, PayloadValue>;
  language: string | null;
  countryCode: string | null;
  issuedAt: string;
  expiresAt: string | null;
  issuerName: string;
}
interface VerifyResult {
  valid: boolean;
  status: string;
  keyId: string | null;
}

export default function CredentialsPage() {
  const { t } = useT();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [verify, setVerify] = useState<Record<string, VerifyResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Credential[]>("/credentials").then(setCredentials).catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  async function act(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError("");
    try {
      await api(`/credentials/${id}/${action}`, { method: "POST" });
      reload();
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function checkAuthenticity(id: string) {
    setBusy(id);
    setError("");
    try {
      // Public verify: signature validity + current status, no PII (§6).
      const result = await api<VerifyResult>(`/credentials/${id}/verify`);
      setVerify((v) => ({ ...v, [id]: result }));
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t("credentials.title")}</h1>
      <ErrorText>{error}</ErrorText>
      {credentials.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">{t("credentials.none")}</p>
        </Card>
      ) : (
        credentials.map((c) => {
          const v = verify[c.id];
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{t(`credentials.type.${c.credentialType}`)}</p>
                  <p className="text-sm text-gray-600">
                    {t("viewer.issuedBy")} {c.issuerName}
                  </p>
                </div>
                <StatusBadge status={c.status} label={t(`credentials.status.${c.status}`)} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(c.payload).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-gray-500">{key}</dt>
                    <dd className="text-gray-800">{String(value ?? "—")}</dd>
                  </div>
                ))}
                <dt className="text-gray-500">{t("credentials.issuedAt")}</dt>
                <dd className="text-gray-800">
                  {new Date(c.issuedAt).toLocaleDateString()}
                </dd>
                {c.expiresAt && (
                  <>
                    <dt className="text-gray-500">{t("credentials.expiresAt")}</dt>
                    <dd className="text-gray-800">
                      {new Date(c.expiresAt).toLocaleDateString()}
                    </dd>
                  </>
                )}
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.status === "OFFERED" && (
                  <>
                    <Button disabled={busy === c.id} onClick={() => act(c.id, "accept")}>
                      {t("credentials.accept")}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy === c.id}
                      onClick={() => act(c.id, "decline")}
                    >
                      {t("credentials.decline")}
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  disabled={busy === c.id}
                  onClick={() => checkAuthenticity(c.id)}
                >
                  {t("credentials.verify")}
                </Button>
                {v && (
                  <span
                    className={`text-sm ${v.valid ? "text-verified" : "text-red-700"}`}
                  >
                    {v.valid
                      ? t("credentials.verifyValid")
                      : t("credentials.verifyInvalid")}
                  </span>
                )}
              </div>
            </Card>
          );
        })
      )}
    </>
  );
}

/** ACTIVE is the only positive-accent state; REVOKED is a warning; rest neutral. */
function StatusBadge({ status, label }: { status: string; label: string }) {
  if (status === "ACTIVE") return <VerifiedBadge label={label} />;
  const tone =
    status === "REVOKED" || status === "DECLINED_BY_SUBJECT"
      ? "bg-red-50 text-red-700"
      : "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
