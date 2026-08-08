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
  const [editingApp, setEditingApp] = useState<string | null>(null);
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
      <h1 className="text-3xl font-extrabold tracking-tight text-brand">{t("apps.title")}</h1>
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
            <span className="mb-1.5 block font-semibold text-ink/80">
              {t("apps.type")}
            </span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
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
                className="rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {application.title}
                    <span className="ms-2 text-xs text-gray-400">
                      {application.type}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setEditingApp(
                          editingApp === application.id ? null : application.id,
                        )
                      }
                    >
                      {editingApp === application.id
                        ? t("apps.closeContents")
                        : t("apps.editContents")}
                    </Button>
                    <Button variant="secondary" onClick={() => share(application.id)}>
                      {t("apps.share")}
                    </Button>
                  </span>
                </div>
                {editingApp === application.id && (
                  <ApplicationEditor key={application.id} applicationId={application.id} />
                )}
                <SubmissionsPanel applicationId={application.id} />
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
              <li key={s.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40">
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
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
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

// ---------- Contents editor (PUT /applications/:id/items) ----------

interface AppItem {
  itemType: string;
  itemId: string;
  order: number;
}
interface Candidate {
  itemType: string;
  itemId: string;
  label: string;
  order: number;
}

const SECTIONS = ["education", "experience", "languages", "skills"] as const;

function ApplicationEditor({ applicationId }: { applicationId: string }) {
  const { t } = useT();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const keyOf = (itemType: string, itemId: string) => `${itemType}:${itemId}`;

  useEffect(() => {
    Promise.all([
      api<{ items: AppItem[] }>(`/applications/${applicationId}`),
      api<Array<{ id: string; title: string }>>("/cvs"),
      api<Array<{ id: string; title: string }>>("/cover-letters"),
      api<Array<{ id: string; fileName: string; scanStatus: string }>>("/documents"),
      api<Array<{ id: string; credentialType: string; status: string }>>(
        "/credentials",
      ),
    ])
      .then(([application, cvs, letters, documents, credentials]) => {
        const list: Candidate[] = [
          ...cvs.map((cv, i) => ({
            itemType: "CV",
            itemId: cv.id,
            label: cv.title,
            order: i,
          })),
          ...letters.map((l, i) => ({
            itemType: "COVER_LETTER",
            itemId: l.id,
            label: l.title,
            order: 10 + i,
          })),
          ...credentials
            .filter((c) => c.status === "ACTIVE")
            .map((c, i) => ({
              itemType: "CREDENTIAL",
              itemId: c.id,
              label: t(`credentials.type.${c.credentialType}`),
              order: 20 + i,
            })),
          ...documents
            .filter((d) => d.scanStatus === "CLEAN")
            .map((d, i) => ({
              itemType: "DOCUMENT",
              itemId: d.id,
              label: d.fileName,
              order: 100 + i,
            })),
          ...SECTIONS.map((section, i) => ({
            itemType: "SECTION",
            itemId: section,
            label: t(`cv.section.${section === "languages" ? "languages" : section}`),
            order: 200 + i,
          })),
        ];
        setCandidates(list);
        setSelected(
          new Set(application.items.map((it) => keyOf(it.itemType, it.itemId))),
        );
        setLoaded(true);
      })
      .catch(() => setError(t("common.error")));
  }, [applicationId, t]);

  function toggle(candidate: Candidate) {
    setSelected((current) => {
      const next = new Set(current);
      const key = keyOf(candidate.itemType, candidate.itemId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setError("");
    setSaved(false);
    try {
      const items = candidates
        .filter((c) => selected.has(keyOf(c.itemType, c.itemId)))
        .map((c) => ({ itemType: c.itemType, itemId: c.itemId, order: c.order }));
      await api(`/applications/${applicationId}/items`, {
        method: "PUT",
        body: { items },
      });
      setSaved(true);
    } catch {
      setError(t("common.error"));
    }
  }

  if (!loaded) {
    return <p className="mt-3 text-xs text-gray-500">{t("common.loading")}</p>;
  }

  const groups: Array<[string, Candidate[]]> = [
    ["apps.group.cvs", candidates.filter((c) => c.itemType === "CV")],
    ["apps.group.letters", candidates.filter((c) => c.itemType === "COVER_LETTER")],
    ["apps.group.credentials", candidates.filter((c) => c.itemType === "CREDENTIAL")],
    ["apps.group.documents", candidates.filter((c) => c.itemType === "DOCUMENT")],
    ["apps.group.sections", candidates.filter((c) => c.itemType === "SECTION")],
  ];

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(([labelKey, list]) =>
          list.length === 0 ? null : (
            <div key={labelKey}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-tint">
                {t(labelKey)}
              </p>
              <ul className="space-y-1">
                {list.map((candidate) => (
                  <li key={keyOf(candidate.itemType, candidate.itemId)}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(
                          keyOf(candidate.itemType, candidate.itemId),
                        )}
                        onChange={() => toggle(candidate)}
                      />
                      {candidate.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save}>{t("common.save")}</Button>
        {saved && <span className="text-sm text-verified">{t("letters.saved")}</span>}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// ---------- Employer submissions (Phase 5.1, applicant side) ----------

interface Employer {
  id: string;
  name: string;
}
interface Submission {
  id: string;
  status: string;
  organizationName: string;
  submittedAt: string;
}

function SubmissionsPanel({ applicationId }: { applicationId: string }) {
  const { t } = useT();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Submission[]>(`/applications/${applicationId}/submissions`)
      .then(setSubmissions)
      .catch(() => undefined);
  }, [applicationId]);
  useEffect(() => {
    api<Employer[]>("/employers").then(setEmployers).catch(() => undefined);
    reload();
  }, [reload]);

  async function submit() {
    if (!orgId) return;
    setError("");
    try {
      await api(`/applications/${applicationId}/submit`, {
        method: "POST",
        body: { organizationId: orgId },
      });
      setOrgId("");
      reload();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "ALREADY_SUBMITTED"
          ? t("submit.already")
          : t("common.error"),
      );
    }
  }

  async function withdraw(id: string) {
    await api(`/submissions/${id}/withdraw`, { method: "POST" }).catch(
      () => undefined,
    );
    reload();
  }

  if (employers.length === 0 && submissions.length === 0) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      {submissions.length > 0 && (
        <ul className="mb-2 space-y-1">
          {submissions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {s.organizationName}
                <span
                  className={`ms-2 text-xs ${
                    s.status === "WITHDRAWN" || s.status === "REJECTED"
                      ? "text-gray-400"
                      : "font-medium text-brand-tint"
                  }`}
                >
                  {t(`submit.status.${s.status}`)}
                </span>
              </span>
              {s.status !== "WITHDRAWN" && (
                <button
                  onClick={() => withdraw(s.id)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  {t("submit.withdraw")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {employers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
          >
            <option value="">{t("submit.chooseEmployer")}</option>
            {employers.map((employer) => (
              <option key={employer.id} value={employer.id}>
                {employer.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" disabled={!orgId} onClick={submit}>
            {t("submit.action")}
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
