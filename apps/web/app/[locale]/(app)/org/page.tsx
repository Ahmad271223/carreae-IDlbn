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
      <h1 className="text-2xl font-bold">{t("org.title")}</h1>

      {memberships.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {memberships.map((m) => (
            <button
              key={m.organization.id}
              onClick={() => setSelected(m.organization.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                selected === m.organization.id
                  ? "bg-brand/10 font-medium text-brand"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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

  return (
    <>
      <Card title={org.name} actions={<VerifiedBadge label={t("org.verified")} />}>
        <p className="text-sm text-gray-600">
          {t(`org.type.${org.type}`)} · {t(`org.role.${membership.role}`)}
        </p>
      </Card>
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
            <li key={item.id} className="rounded-md border border-gray-200 p-3">
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
              <span className="mb-1 block font-medium text-gray-700">
                {t("org.credentialType")}
              </span>
              <select
                value={credentialType}
                onChange={(e) => setCredentialType(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
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
              className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
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
          <span className="mb-1 block font-medium text-gray-700">{t("org.relType")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
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
              className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
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
            <span className="mb-1 block font-medium text-gray-700">{t("org.memberRole")}</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
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
            className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
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
          <span className="mb-1 block font-medium text-gray-700">{t("org.orgType")}</span>
          <select
            value={values.type}
            onChange={(e) => setValues({ ...values, type: e.target.value })}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
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
