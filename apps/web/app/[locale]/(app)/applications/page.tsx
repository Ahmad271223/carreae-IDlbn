"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Button, Card, ErrorText, Field, Input } from "../../../../components/ui";

interface Application {
  id: string;
  title: string;
  type: string;
  status: string;
}
interface Share {
  id: string;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}
interface AccessLogEntry {
  id: string;
  accessedAt: string;
  orgHint: string | null;
  ipCoarse: string | null;
  sectionsViewed: string[] | null;
}
interface Consent {
  id: string;
  recipient: string;
  purpose: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export default function ApplicationsPage() {
  const { t } = useT();
  const [applications, setApplications] = useState<Application[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [logs, setLogs] = useState<Record<string, AccessLogEntry[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("JOB");
  const [shareResult, setShareResult] = useState<{ url: string; qrSvg: string } | null>(
    null,
  );
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Application[]>("/applications").then(setApplications).catch(() => undefined);
    api<Share[]>("/shares").then(setShares).catch(() => undefined);
    api<Consent[]>("/consents").then(setConsents).catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  async function toggleLog(shareId: string) {
    if (expanded === shareId) {
      setExpanded(null);
      return;
    }
    setExpanded(shareId);
    if (!logs[shareId]) {
      const entries = await api<AccessLogEntry[]>(
        `/shares/${shareId}/access-log`,
      ).catch(() => []);
      setLogs((l) => ({ ...l, [shareId]: entries }));
    }
  }

  async function revokeConsent(id: string) {
    await api(`/consents/${id}/revoke`, { method: "POST" }).catch(() => undefined);
    reload();
  }

  /** Creates the application and attaches everything usable automatically. */
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const application = await api<Application>("/applications", {
        method: "POST",
        body: { title, type },
      });
      const [cvs, documents, credentials] = await Promise.all([
        api<Array<{ id: string }>>("/cvs"),
        api<Array<{ id: string; scanStatus: string }>>("/documents"),
        api<Array<{ id: string; status: string }>>("/credentials"),
      ]);
      const items = [
        ...cvs.slice(0, 1).map((cv) => ({ itemType: "CV", itemId: cv.id, order: 0 })),
        ...credentials
          .filter((c) => c.status === "ACTIVE")
          .map((c, i) => ({ itemType: "CREDENTIAL", itemId: c.id, order: 10 + i })),
        ...documents
          .filter((d) => d.scanStatus === "CLEAN")
          .map((d, i) => ({ itemType: "DOCUMENT", itemId: d.id, order: 100 + i })),
        { itemType: "SECTION", itemId: "education", order: 200 },
        { itemType: "SECTION", itemId: "experience", order: 201 },
        { itemType: "SECTION", itemId: "languages", order: 202 },
        { itemType: "SECTION", itemId: "skills", order: 203 },
      ];
      await api(`/applications/${application.id}/items`, {
        method: "PUT",
        body: { items },
      });
      setTitle("");
      reload();
    } catch {
      setError(t("common.error"));
    }
  }

  async function share(applicationId: string) {
    setError("");
    try {
      const result = await api<{ url: string; qrSvg: string }>(
        `/applications/${applicationId}/share`,
        { method: "POST", body: {} },
      );
      setShareResult(result);
      reload();
    } catch {
      setError(t("common.error"));
    }
  }

  async function revoke(shareId: string) {
    await api(`/shares/${shareId}/revoke`, { method: "POST" }).catch(() => undefined);
    reload();
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t("apps.title")}</h1>
      <Card title={t("apps.create")}>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label={t("apps.appTitle")}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </Field>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">
              {t("apps.type")}
            </span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              <option>JOB</option>
              <option>UNIVERSITY</option>
              <option>GENERAL</option>
            </select>
          </label>
          <Button type="submit">{t("apps.create")}</Button>
        </form>
        <p className="mt-2 text-xs text-gray-500">{t("apps.attachHint")}</p>
        <ErrorText>{error}</ErrorText>
      </Card>

      {shareResult && (
        <Card title={t("apps.link")}>
          <p className="break-all text-sm">
            <a
              className="text-brand underline"
              href={shareResult.url}
              target="_blank"
              rel="noopener"
            >
              {shareResult.url}
            </a>
          </p>
          <div
            className="mt-3 w-40 [&_svg]:h-auto [&_svg]:w-full"
            // QR encodes exactly the share URL and nothing else (§37).
            dangerouslySetInnerHTML={{ __html: shareResult.qrSvg }}
          />
        </Card>
      )}

      <Card title={t("apps.title")}>
        {applications.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="space-y-1">
            {applications.map((application) => (
              <li
                key={application.id}
                className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
              >
                <span>
                  {application.title}
                  <span className="ms-2 text-xs text-gray-400">
                    {application.type}
                  </span>
                </span>
                <Button variant="secondary" onClick={() => share(application.id)}>
                  {t("apps.share")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("apps.link")}>
        {shares.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="space-y-1">
            {shares.map((s) => (
              <li key={s.id} className="rounded-md bg-gray-50 px-3 py-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {new Date(s.createdAt).toLocaleDateString()} · {s.viewCount}×
                    {s.revokedAt && (
                      <span className="ms-2 text-xs text-gray-400">
                        {t("apps.revoked")}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-2">
                    <Button variant="secondary" onClick={() => toggleLog(s.id)}>
                      {expanded === s.id ? t("apps.hideLog") : t("apps.accessLog")}
                    </Button>
                    {!s.revokedAt && (
                      <Button variant="danger" onClick={() => revoke(s.id)}>
                        {t("apps.revoke")}
                      </Button>
                    )}
                  </span>
                </div>
                {expanded === s.id && (
                  <div className="mt-2 border-t border-gray-200 pt-2">
                    {(logs[s.id]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-gray-500">{t("apps.noAccess")}</p>
                    ) : (
                      <ul className="space-y-0.5 text-xs text-gray-600">
                        {logs[s.id]!.map((entry) => (
                          <li key={entry.id}>
                            {new Date(entry.accessedAt).toLocaleString()}
                            {entry.orgHint && ` · ${entry.orgHint}`}
                            {entry.ipCoarse && ` · ${entry.ipCoarse}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("apps.consents")}>
        {consents.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="space-y-1">
            {consents.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
              >
                <span>
                  {c.purpose}
                  <span className="ms-2 text-xs text-gray-400">
                    {c.recipient} · {new Date(c.grantedAt).toLocaleDateString()}
                    {c.revokedAt && ` · ${t("apps.revoked")}`}
                  </span>
                </span>
                {!c.revokedAt && (
                  <Button variant="danger" onClick={() => revokeConsent(c.id)}>
                    {t("apps.revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500">{t("apps.consentHint")}</p>
      </Card>
    </>
  );
}
