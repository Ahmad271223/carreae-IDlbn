"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { useT } from "../../../../../lib/i18n-client";
import { Button, Card, ErrorText, Field, Input } from "../../../../../components/ui";

interface Me {
  email: string;
  mfaEnabled: boolean;
}
interface Session {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export default function SecurityPage() {
  const { t } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  const reload = useCallback(() => {
    api<Me>("/auth/me").then(setMe).catch(() => undefined);
    api<{ sessions: Session[] }>("/auth/sessions")
      .then((r) => setSessions(r.sessions))
      .catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  async function revokeSession(id: string) {
    await api(`/auth/sessions/${id}`, { method: "DELETE" }).catch(() => undefined);
    reload();
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t("security.title")}</h1>
      {me && <MfaSection enabled={me.mfaEnabled} onChange={reload} />}
      <SsoSection />
      <Card title={t("security.sessions")}>
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
            >
              <span>
                {s.deviceName ?? t("security.unknownDevice")}
                {s.current && (
                  <span className="ms-2 text-xs text-verified">
                    {t("security.thisDevice")}
                  </span>
                )}
                <span className="ms-2 text-xs text-gray-400">
                  {new Date(s.lastSeenAt).toLocaleString()}
                </span>
              </span>
              {!s.current && (
                <Button variant="danger" onClick={() => revokeSession(s.id)}>
                  {t("security.revokeSession")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function MfaSection({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const { t } = useT();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function startEnroll() {
    setError("");
    setBusy(true);
    try {
      const result = await api<{ secret: string; otpauthUri: string }>(
        "/auth/mfa/totp",
        { method: "POST" },
      );
      setSetup(result);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "MFA_ALREADY_ENABLED"
          ? t("security.mfaAlready")
          : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError("");
    setBusy(true);
    try {
      await api("/auth/mfa/totp/confirm", { method: "POST", body: { code } });
      setSetup(null);
      setCode("");
      onChange();
    } catch {
      setError(t("auth.mfaInvalid"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError("");
    setBusy(true);
    try {
      await api("/auth/mfa/totp/disable", { method: "POST", body: { code } });
      setCode("");
      onChange();
    } catch {
      setError(t("auth.mfaInvalid"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("security.mfa")}>
      {enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-verified">{t("security.mfaEnabled")}</p>
          <p className="text-sm text-gray-600">{t("security.mfaDisableHint")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("auth.mfaCode")}>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Button variant="danger" disabled={busy || code.length !== 6} onClick={disable}>
              {t("security.mfaDisable")}
            </Button>
          </div>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t("security.mfaScanHint")}</p>
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-xs text-gray-500">{t("security.mfaSecret")}</p>
            <p className="break-all font-mono text-sm">{setup.secret}</p>
            <a
              href={setup.otpauthUri}
              className="mt-2 inline-block break-all text-xs text-brand underline"
            >
              {t("security.mfaOpenApp")}
            </a>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("auth.mfaCode")}>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </Field>
            <Button disabled={busy || code.length !== 6} onClick={confirm}>
              {t("security.mfaConfirm")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">{t("security.mfaHint")}</p>
          <Button disabled={busy} onClick={startEnroll}>
            {t("security.mfaEnable")}
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function SsoSection() {
  const { t } = useT();
  const [error, setError] = useState("");

  async function link(provider: "google" | "apple") {
    setError("");
    try {
      // No silent linking: the server hands back a URL to redirect into.
      const { url } = await api<{ url: string }>(`/auth/oauth/${provider}/link`, {
        method: "POST",
      });
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? t("security.ssoUnavailable")
          : t("common.error"),
      );
    }
  }

  return (
    <Card title={t("security.sso")}>
      <p className="mb-2 text-sm text-gray-600">{t("security.ssoHint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => link("google")}>
          {t("security.linkGoogle")}
        </Button>
        <Button variant="secondary" onClick={() => link("apple")}>
          {t("security.linkApple")}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
