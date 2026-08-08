"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  VerifiedBadge,
} from "../../../../components/ui";

const ORG_TYPES = [
  "SCHOOL",
  "UNIVERSITY",
  "LANGUAGE_SCHOOL",
  "TRAINING_PROVIDER",
  "EMPLOYER",
] as const;
const ISSUER_ROLES = new Set(["OWNER", "ADMIN", "ISSUER"]);
const MANAGER_ROLES = new Set(["OWNER", "ADMIN"]);
const INBOX_ROLES = new Set(["OWNER", "ADMIN", "RECRUITER"]);

interface Organization {
  id: string;
  name: string;
  type: string;
  verificationStatus: string;
}
interface Membership {
  role: string;
  organization: Organization;
}

export default function OrgPage() {
  const { t } = useT();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    api<Membership[]>("/organizations/mine")
      .then((rows) => {
        setMemberships(rows);
        setSelected((s) => s ?? rows[0]?.organization.id ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  useEffect(reload, [reload]);

  const current = memberships.find((m) => m.organization.id === selected);

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand">{t("org.title")}</h1>

      {memberships.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {memberships.map((m) => (
            <button
              key={m.organization.id}
              onClick={() => setSelected(m.organization.id)}
              className={`rounded-xl px-3.5 py-2 text-sm transition-colors ${
                selected === m.organization.id
                  ? "bg-brand font-semibold text-white shadow-sm"
                  : "bg-white text-muted ring-1 ring-inset ring-line hover:bg-brand-soft hover:text-brand"
              }`}
            >
              {m.organization.name}
            </button>
          ))}
        </div>
      )}

      {current && <OrgDetail membership={current} />}

      {loaded && memberships.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500">{t("org.none")}</p>
        </Card>
      )}

      <RegisterOrg onDone={reload} />
    </>
  );
}

function OrgDetail({ membership }: { membership: Membership }) {
  const { t } = useT();
  const org = membership.organization;

  if (org.verificationStatus !== "VERIFIED") {
    // OrgAccessGuard blocks the portal until the trust team approves (§44).
    return (
      <Card title={org.name}>
        <p className="text-sm text-amber-700">
          {t(`org.status.${org.verificationStatus}`)}
        </p>
        <p className="mt-1 text-xs text-gray-500">{t("org.pendingHint")}</p>
      </Card>
    );
  }

  const orgId = org.id;
  const canIssue = ISSUER_ROLES.has(membership.role);
  const canManage = MANAGER_ROLES.has(membership.role);
  const canRecruit = INBOX_ROLES.has(membership.role);

  return (
    <>
      <Card title={org.name} actions={<VerifiedBadge label={t("org.verified")} />}>
        <p className="text-sm text-gray-600">
          {t(`org.type.${org.type}`)} · {t(`org.role.${membership.role}`)}
        </p>
      </Card>
      {org.type === "EMPLOYER" && canRecruit && <Inbox orgId={orgId} />}
      <VerificationQueue orgId={orgId} canAct={canIssue} />
      <IssueCredential orgId={orgId} canIssue={canIssue} />
      <Relationships orgId={orgId} />
      <Members orgId={orgId} canManage={canManage} />
    </>
  );
}

// ---------- Verification queue ----------

interface QueueItem {
  id: string;
  subjectType: string;
  fieldSnapshot: Record<string, unknown>;
  requestedAt: string;
  expiresAt: string;
}

function VerificationQueue({ orgId, canAct }: { orgId: string; canAct: boolean }) {
  const { t } = useT();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<QueueItem[]>(`/org/${orgId}/verifications`).then(setItems).catch(() => undefined);
  }, [orgId]);
  useEffect(reload, [reload]);

  async function act(id: string, action: "confirm" | "decline") {
    setError("");
    try {
      await api(`/org/${orgId}/verifications/${id}/${action}`, { method: "POST" });
      reload();
    } catch (e) {
      // SNAPSHOT_STALE: the entry changed after the request — it can't confirm.
      setError(
        e instanceof Error && e.message === "SNAPSHOT_STALE"
          ? t("org.snapshotStale")
          : t("common.error"),
      );
    }
  }

  return (
    <Card title={t("org.queue")}>
      <ErrorText>{error}</ErrorText>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{t("common.none")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t(`org.subject.${item.subjectType}`)}
              </p>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                {Object.entries(item.fieldSnapshot).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-gray-500">{key}</dt>
                    <dd className="text-gray-800">{String(value ?? "—")}</dd>
                  </div>
                ))}
              </dl>
              {canAct && (
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => act(item.id, "confirm")}>
                    {t("org.confirm")}
                  </Button>
                  <Button variant="danger" onClick={() => act(item.id, "decline")}>
                    {t("org.decline")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- Issue credential ----------

const CREDENTIAL_TYPES = [
  "SCHOOL_LEAVING",
  "DEGREE",
  "TRANSCRIPT",
  "ENROLLMENT",
  "LANGUAGE",
  "COURSE",
  "CERTIFICATE",
  "EMPLOYMENT",
] as const;

interface IssuedCredential {
  id: string;
  credentialType: string;
  status: string;
  createdAt: string;
}

function IssueCredential({ orgId, canIssue }: { orgId: string; canIssue: boolean }) {
  const { t } = useT();
  const [issued, setIssued] = useState<IssuedCredential[]>([]);
  const [subjectSlug, setSubjectSlug] = useState("");
  const [credentialType, setCredentialType] = useState<string>("DEGREE");
  const [pairs, setPairs] = useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<IssuedCredential[]>(`/org/${orgId}/credentials`)
      .then(setIssued)
      .catch(() => undefined);
  }, [orgId]);
  useEffect(reload, [reload]);

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const payload: Record<string, string> = {};
    for (const { key, value } of pairs) {
      if (key.trim()) payload[key.trim()] = value;
    }
    try {
      await api(`/org/${orgId}/credentials`, {
        method: "POST",
        body: { subjectSlug, credentialType, payload },
      });
      setSubjectSlug("");
      setPairs([{ key: "", value: "" }]);
      reload();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "SUBJECT_NOT_FOUND"
          ? t("org.subjectNotFound")
          : t("common.error"),
      );
    }
  }

  async function revoke(id: string) {
    const reason = window.prompt(t("org.revokeReason"));
    if (!reason) return;
    await api(`/org/${orgId}/credentials/${id}/revoke`, {
      method: "POST",
      body: { reason },
    }).catch(() => undefined);
    reload();
  }

  return (
    <Card title={t("org.credentials")}>
      {canIssue && (
        <form onSubmit={issue} className="mb-4 space-y-3 border-b border-gray-100 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Field label={t("org.subjectSlug")}>
                <Input
                  value={subjectSlug}
                  onChange={(e) => setSubjectSlug(e.target.value)}
                  placeholder="handle"
                  required
                />
              </Field>
            </div>
            <label className="text-sm">
              <span className="mb-1.5 block font-semibold text-ink/80">
                {t("org.credentialType")}
              </span>
              <select
                value={credentialType}
                onChange={(e) => setCredentialType(e.target.value)}
                className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
              >
                {CREDENTIAL_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`credentials.type.${c}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-gray-700">
              {t("org.payload")}
            </span>
            {credentialType === "LANGUAGE" && (
              <p className="text-xs text-amber-700">{t("org.languagePayloadHint")}</p>
            )}
            {pairs.map((pair, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={pair.key}
                  placeholder={t("org.payloadKey")}
                  onChange={(e) =>
                    setPairs((p) =>
                      p.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  value={pair.value}
                  placeholder={t("org.payloadValue")}
                  onChange={(e) =>
                    setPairs((p) =>
                      p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPairs((p) => [...p, { key: "", value: "" }])}
            >
              {t("org.addField")}
            </Button>
          </div>
          <Button type="submit">{t("org.issue")}</Button>
          <ErrorText>{error}</ErrorText>
        </form>
      )}

      {issued.length === 0 ? (
        <p className="text-sm text-gray-500">{t("common.none")}</p>
      ) : (
        <ul className="space-y-1">
          {issued.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
            >
              <span>
                {t(`credentials.type.${c.credentialType}`)}
                <span className="ms-2 text-xs text-gray-400">
                  {t(`credentials.status.${c.status}`)}
                </span>
              </span>
              {canIssue && (c.status === "ACTIVE" || c.status === "OFFERED") && (
                <Button variant="danger" onClick={() => revoke(c.id)}>
                  {t("org.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- Relationships ----------

const RELATIONSHIP_TYPES = ["STUDENT", "ALUMNUS", "EMPLOYEE", "MEMBER"] as const;

interface Relationship {
  id: string;
  type: string;
  status: string;
}

function Relationships({ orgId }: { orgId: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<Relationship[]>([]);
  const [handle, setHandle] = useState("");
  const [type, setType] = useState<string>("STUDENT");
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Relationship[]>(`/org/${orgId}/relationships`).then(setRows).catch(() => undefined);
  }, [orgId]);
  useEffect(reload, [reload]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    // Address by handle or email — orgs never search the user base (§39).
    const byEmail = handle.includes("@");
    try {
      await api(`/org/${orgId}/relationships/invite`, {
        method: "POST",
        body: { [byEmail ? "email" : "handle"]: handle, type },
      });
      setHandle("");
      reload();
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <Card title={t("org.relationships")}>
      <form onSubmit={invite} className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field label={t("org.inviteHandle")}>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="handle or email"
              required
            />
          </Field>
        </div>
        <label className="text-sm">
          <span className="mb-1.5 block font-semibold text-ink/80">{t("org.relType")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
          >
            {RELATIONSHIP_TYPES.map((r) => (
              <option key={r} value={r}>
                {t(`org.relType.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">{t("org.invite")}</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{t("common.none")}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
            >
              <span>{t(`org.relType.${r.type}`)}</span>
              <span className="text-xs text-gray-400">{t(`org.relStatus.${r.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- Members ----------

const MEMBER_ROLES = ["OWNER", "ADMIN", "ISSUER", "RECRUITER", "VIEWER"] as const;

interface Member {
  id: string;
  userId: string;
  role: string;
}

function Members({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const { t } = useT();
  const [rows, setRows] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("VIEWER");
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Member[]>(`/org/${orgId}/members`).then(setRows).catch(() => undefined);
  }, [orgId]);
  useEffect(reload, [reload]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api(`/org/${orgId}/members`, { method: "POST", body: { email, role } });
      setEmail("");
      reload();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "OWNER_REQUIRED"
          ? t("org.ownerRequired")
          : t("common.error"),
      );
    }
  }

  async function remove(id: string) {
    await api(`/org/${orgId}/members/${id}`, { method: "DELETE" }).catch(() => undefined);
    reload();
  }

  return (
    <Card title={t("org.members")}>
      {canManage && (
        <form onSubmit={add} className="mb-3 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label={t("auth.email")}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          </div>
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold text-ink/80">{t("org.memberRole")}</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
            >
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`org.role.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">{t("org.addMember")}</Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
      <ul className="space-y-1">
        {rows.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
          >
            <span className="font-mono text-xs text-gray-600">
              {m.userId.slice(0, 8)}
              <span className="ms-2 font-sans text-xs text-gray-400">
                {t(`org.role.${m.role}`)}
              </span>
            </span>
            {canManage && (
              <button
                onClick={() => remove(m.id)}
                className="text-xs text-gray-400 hover:text-red-600"
              >
                {t("common.remove")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- Register a new organization ----------

function RegisterOrg({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({ type: "UNIVERSITY" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/organizations", {
        method: "POST",
        body: {
          type: values.type,
          name: values.name,
          legalName: values.legalName || null,
          countryCode: values.countryCode,
          website: values.website || null,
        },
      });
      setDone(true);
      setValues({ type: "UNIVERSITY" });
      onDone();
    } catch {
      setError(t("common.error"));
    }
  }

  if (!open) {
    return (
      <Card>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("org.register")}
        </Button>
      </Card>
    );
  }

  return (
    <Card title={t("org.register")}>
      {done && <p className="mb-2 text-sm text-verified">{t("org.registered")}</p>}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1.5 block font-semibold text-ink/80">{t("org.orgType")}</span>
          <select
            value={values.type}
            onChange={(e) => setValues({ ...values, type: e.target.value })}
            className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
          >
            {ORG_TYPES.map((o) => (
              <option key={o} value={o}>
                {t(`org.type.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-48 flex-1">
          <Field label={t("org.orgName")}>
            <Input
              value={values.name ?? ""}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              required
            />
          </Field>
        </div>
        <div className="w-24">
          <Field label={t("profile.country")}>
            <Input
              value={values.countryCode ?? ""}
              maxLength={2}
              placeholder="LB"
              onChange={(e) =>
                setValues({ ...values, countryCode: e.target.value.toUpperCase() })
              }
              required
            />
          </Field>
        </div>
        <div className="min-w-48 flex-1">
          <Field label={t("org.website")}>
            <Input
              value={values.website ?? ""}
              placeholder="https://"
              onChange={(e) => setValues({ ...values, website: e.target.value })}
            />
          </Field>
        </div>
        <Button type="submit">{t("org.register")}</Button>
      </form>
      <p className="mt-2 text-xs text-gray-500">{t("org.registerHint")}</p>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// ---------- Application inbox (Phase 5.1) ----------

const PIPELINE = [
  "RECEIVED",
  "IN_REVIEW",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

interface InboxRow {
  id: string;
  status: string;
  note: string | null;
  submittedAt: string;
  applicationTitle: string;
  applicationType: string;
  applicantName: string;
}
interface ViewerEntry {
  title: string;
  subtitle?: string;
  dateRange?: string;
  description?: string;
  badge?: { verifiedBy: string; verifiedAt: string };
}
interface ViewerPayload {
  applicant: { name: string; headline?: string };
  sections: Record<string, ViewerEntry[]>;
  credentials: Array<{
    credentialType: string;
    issuer: string;
    issuedAt: string;
    status: string;
  }>;
  documents: Array<{ id: string; fileName: string; downloadable: boolean }>;
  coverLetters: Array<{ title: string; paragraphs: string[] }>;
}

function Inbox({ orgId }: { orgId: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [views, setViews] = useState<Record<string, ViewerPayload>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<InboxRow[]>(`/org/${orgId}/submissions`).then(setRows).catch(() => undefined);
  }, [orgId]);
  useEffect(reload, [reload]);

  async function toggleView(id: string) {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    if (!views[id]) {
      try {
        const payload = await api<ViewerPayload>(
          `/org/${orgId}/submissions/${id}/view`,
        );
        setViews((v) => ({ ...v, [id]: payload }));
      } catch {
        setError(t("inbox.gone"));
        setOpen(null);
      }
    }
  }

  async function setStatus(id: string, status: string) {
    setError("");
    try {
      await api(`/org/${orgId}/submissions/${id}/status`, {
        method: "POST",
        body: { status },
      });
      reload();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "WITHDRAWN"
          ? t("inbox.withdrawn")
          : t("common.error"),
      );
    }
  }

  async function openDocument(id: string, documentId: string) {
    const { url } = await api<{ url: string }>(
      `/org/${orgId}/submissions/${id}/documents/${documentId}`,
    ).catch(() => ({ url: "" }));
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <Card title={t("inbox.title")}>
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{t("common.none")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const view = views[row.id];
            return (
              <li key={row.id} className="rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <span className="font-medium">{row.applicantName}</span>
                    <span className="ms-2 text-muted">{row.applicationTitle}</span>
                    <span className="ms-2 text-xs text-gray-400">
                      {new Date(row.submittedAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {row.status === "WITHDRAWN" ? (
                      <span className="text-xs text-gray-400">
                        {t("submit.status.WITHDRAWN")}
                      </span>
                    ) : (
                      <select
                        value={row.status}
                        onChange={(e) => setStatus(row.id, e.target.value)}
                        className="rounded-lg border border-line bg-white px-2 py-1 text-xs shadow-sm"
                      >
                        {PIPELINE.map((s) => (
                          <option key={s} value={s}>
                            {t(`submit.status.${s}`)}
                          </option>
                        ))}
                      </select>
                    )}
                    {row.status !== "WITHDRAWN" && (
                      <Button variant="secondary" onClick={() => toggleView(row.id)}>
                        {open === row.id ? t("inbox.hide") : t("inbox.view")}
                      </Button>
                    )}
                  </span>
                </div>

                {open === row.id && view && (
                  <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
                    <div>
                      <p className="font-display text-base font-bold text-brand">
                        {view.applicant.name}
                      </p>
                      {view.applicant.headline && (
                        <p className="text-muted">{view.applicant.headline}</p>
                      )}
                    </div>
                    {Object.entries(view.sections).map(([key, entries]) => (
                      <div key={key}>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-tint">
                          {t(`cv.section.${key}`)}
                        </p>
                        <ul className="space-y-1">
                          {entries.map((entry, i) => (
                            <li key={i}>
                              {entry.title}
                              {entry.subtitle && (
                                <span className="text-muted"> — {entry.subtitle}</span>
                              )}
                              {entry.dateRange && (
                                <span className="ms-2 text-xs text-gray-400">
                                  {entry.dateRange}
                                </span>
                              )}{" "}
                              {entry.badge && (
                                <VerifiedBadge
                                  label={t("verification.verifiedBy", {
                                    org: entry.badge.verifiedBy,
                                  })}
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {view.credentials.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-tint">
                          {t("viewer.credentials")}
                        </p>
                        <ul className="space-y-1">
                          {view.credentials.map((credential, i) => (
                            <li key={i}>
                              {t(`credentials.type.${credential.credentialType}`)} —{" "}
                              {credential.issuer}
                              <span className="ms-2 text-xs text-gray-400">
                                {t(`credentials.status.${credential.status}`)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {view.documents.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-tint">
                          {t("viewer.documents")}
                        </p>
                        <ul className="space-y-1">
                          {view.documents.map((document) => (
                            <li key={document.id}>
                              {document.downloadable ? (
                                <button
                                  onClick={() => openDocument(row.id, document.id)}
                                  className="text-brand underline"
                                >
                                  {document.fileName}
                                </button>
                              ) : (
                                document.fileName
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {view.coverLetters.map((letter, i) => (
                      <div key={i}>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-tint">
                          {letter.title}
                        </p>
                        {letter.paragraphs.map((paragraph, j) => (
                          <p key={j} className="mb-1 whitespace-pre-wrap text-ink/90">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
