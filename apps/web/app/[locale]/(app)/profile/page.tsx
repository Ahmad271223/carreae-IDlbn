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

interface Entry {
  id: string;
  [key: string]: unknown;
}
interface VerificationRequest {
  id: string;
  subjectType: string;
  subjectId: string;
  organizationId: string;
  status: string;
  organizationName: string;
}
interface Relationship {
  id: string;
  type: string;
  organizationId: string;
  organizationName: string;
  status: string;
}

export default function ProfilePage() {
  const { t } = useT();
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [educations, setEducations] = useState<Entry[]>([]);
  const [experiences, setExperiences] = useState<Entry[]>([]);
  const [languages, setLanguages] = useState<Entry[]>([]);
  const [skills, setSkills] = useState<Entry[]>([]);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Record<string, string> | null>("/profile")
      .then((p) => setProfile(p ?? {}))
      .catch(() => undefined);
    api<Entry[]>("/educations").then(setEducations).catch(() => undefined);
    api<Entry[]>("/experiences").then(setExperiences).catch(() => undefined);
    api<Entry[]>("/languages").then(setLanguages).catch(() => undefined);
    api<Entry[]>("/skills").then(setSkills).catch(() => undefined);
    api<VerificationRequest[]>("/verifications")
      .then(setVerifications)
      .catch(() => undefined);
    api<Relationship[]>("/relationships")
      .then(setRelationships)
      .catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  async function respondRelationship(id: string, action: "accept" | "decline") {
    await api(`/relationships/${id}/${action}`, { method: "POST" }).catch(
      () => undefined,
    );
    reload();
  }

  const activeRelationships = relationships.filter((r) => r.status === "ACTIVE");
  const invitedRelationships = relationships.filter((r) => r.status === "INVITED");

  async function requestVerification(
    subjectType: string,
    subjectId: string,
    organizationId: string,
  ) {
    setError("");
    try {
      await api("/verifications", {
        method: "POST",
        body: { subjectType, subjectId, organizationId },
      });
      reload();
    } catch (e) {
      // Only VERIFIED orgs can confirm (§44) — surface that distinctly.
      setError(
        e instanceof Error && e.message === "ORGANIZATION_NOT_VERIFIED"
          ? t("verification.orgNotVerified")
          : t("common.error"),
      );
    }
  }

  async function revokeVerification(id: string) {
    await api(`/verifications/${id}/revoke`, { method: "POST" }).catch(
      () => undefined,
    );
    reload();
  }

  function verificationFor(subjectType: string, id: string) {
    // Owner view — pending/declined are visible to the owner only (§5).
    return (
      <VerificationControl
        subjectType={subjectType}
        subjectId={id}
        requests={verifications.filter(
          (v) => v.subjectType === subjectType && v.subjectId === id,
        )}
        relationships={activeRelationships}
        onRequest={requestVerification}
        onRevoke={revokeVerification}
      />
    );
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/profile", {
        method: "PATCH",
        body: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          headline: profile.headline || null,
          summary: profile.summary || null,
          city: profile.city || null,
          countryCode: profile.countryCode || null,
        },
      });
      reload();
    } catch {
      setError(t("common.error"));
    }
  }

  async function addEntry(path: string, body: Record<string, unknown>) {
    setError("");
    try {
      await api(path, { method: "POST", body });
      reload();
    } catch {
      setError(t("common.error"));
    }
  }

  async function removeEntry(path: string, id: string) {
    await api(`${path}/${id}`, { method: "DELETE" }).catch(() => undefined);
    reload();
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
      <Card title={t("profile.title")}>
        <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["firstName", "profile.firstName"],
              ["lastName", "profile.lastName"],
              ["headline", "profile.headline"],
              ["summary", "profile.summary"],
              ["city", "profile.city"],
              ["countryCode", "profile.country"],
            ] as const
          ).map(([key, labelKey]) => (
            <Field key={key} label={t(labelKey)}>
              <Input
                value={profile[key] ?? ""}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
              />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Button type="submit">{t("common.save")}</Button>
          </div>
        </form>
      </Card>

      {invitedRelationships.length > 0 && (
        <Card title={t("relationship.invitations")}>
          <ul className="space-y-1">
            {invitedRelationships.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
              >
                <span>
                  {t("relationship.invitedBy", { org: r.organizationName })}
                  <span className="ms-2 text-xs text-gray-400">
                    {t(`org.relType.${r.type}`)}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button onClick={() => respondRelationship(r.id, "accept")}>
                    {t("relationship.accept")}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => respondRelationship(r.id, "decline")}
                  >
                    {t("relationship.decline")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t("career.education")}>
        <EntryList
          entries={educations}
          render={(e) => (
            <>
              {String(e.degreeType)} — {String(e.institutionName)}{" "}
              {verificationFor("EDUCATION", e.id)}
            </>
          )}
          onRemove={(id) => removeEntry("/educations", id)}
          removeLabel={t("common.remove")}
        />
        <AddForm
          fields={[
            ["institutionName", t("career.institution")],
            ["degreeType", t("career.degree")],
            ["countryCode", t("profile.country")],
            ["startDate", t("career.startDate")],
            ["endDate", t("career.endDate")],
          ]}
          optional={["endDate"]}
          addLabel={t("common.add")}
          onAdd={(values) =>
            addEntry("/educations", { ...values, endDate: values.endDate || undefined })
          }
        />
      </Card>

      <Card title={t("career.experience")}>
        <EntryList
          entries={experiences}
          render={(e) => (
            <>
              {String(e.position)} — {String(e.companyName)}{" "}
              {verificationFor("EXPERIENCE", e.id)}
            </>
          )}
          onRemove={(id) => removeEntry("/experiences", id)}
          removeLabel={t("common.remove")}
        />
        <AddForm
          fields={[
            ["companyName", t("career.company")],
            ["position", t("career.position")],
            ["startDate", t("career.startDate")],
            ["endDate", t("career.endDate")],
          ]}
          optional={["endDate"]}
          addLabel={t("common.add")}
          onAdd={(values) =>
            addEntry("/experiences", {
              ...values,
              employmentType: "FULL_TIME",
              endDate: values.endDate || undefined,
            })
          }
        />
      </Card>

      <Card title={t("career.languages")}>
        <EntryList
          entries={languages}
          render={(e) => (
            <>
              {String(e.language)} — {String(e.level)} {verificationFor("LANGUAGE", e.id)}
            </>
          )}
          onRemove={(id) => removeEntry("/languages", id)}
          removeLabel={t("common.remove")}
        />
        <AddForm
          fields={[
            ["language", t("career.languageCode")],
            ["level", t("career.level")],
          ]}
          addLabel={t("common.add")}
          onAdd={(values) => addEntry("/languages", values)}
        />
      </Card>

      <Card title={t("career.skills")}>
        <EntryList
          entries={skills}
          render={(e) => <>{String(e.name)}</>}
          onRemove={(id) => removeEntry("/skills", id)}
          removeLabel={t("common.remove")}
        />
        <AddForm
          fields={[["name", t("career.skillName")]]}
          addLabel={t("common.add")}
          onAdd={(values) => addEntry("/skills", { ...values, category: "TECHNICAL" })}
        />
      </Card>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function EntryList({
  entries,
  render,
  onRemove,
  removeLabel,
}: {
  entries: Entry[];
  render: (entry: Entry) => React.ReactNode;
  onRemove: (id: string) => void;
  removeLabel: string;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="mb-3 space-y-1">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
        >
          <span>{render(entry)}</span>
          <button
            onClick={() => onRemove(entry.id)}
            className="text-xs text-gray-400 hover:text-red-600"
          >
            {removeLabel}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddForm({
  fields,
  optional = [],
  addLabel,
  onAdd,
}: {
  fields: ReadonlyArray<readonly [string, string]>;
  optional?: string[];
  addLabel: string;
  onAdd: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(values);
        setValues({});
      }}
    >
      {fields.map(([key, label]) => (
        <div key={key} className="min-w-36 flex-1">
          <Field label={label}>
            <Input
              value={values[key] ?? ""}
              required={!optional.includes(key)}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </Field>
        </div>
      ))}
      <Button type="submit" variant="secondary">
        {addLabel}
      </Button>
    </form>
  );
}

/**
 * Per-entry verification: the VERIFIED badge (public-facing, §5) plus the
 * owner-only request/revoke controls. Pending and declined states are shown
 * to the owner here only — they never reach a share projection.
 */
function VerificationControl({
  subjectType,
  subjectId,
  requests,
  relationships,
  onRequest,
  onRevoke,
}: {
  subjectType: string;
  subjectId: string;
  requests: VerificationRequest[];
  relationships: Relationship[];
  onRequest: (subjectType: string, subjectId: string, orgId: string) => void;
  onRevoke: (id: string) => void;
}) {
  const { t } = useT();
  const [orgId, setOrgId] = useState("");

  const verified = requests.find((r) => r.status === "VERIFIED");
  if (verified) {
    return (
      <VerifiedBadge
        label={t("verification.verifiedBy", { org: verified.organizationName })}
      />
    );
  }

  const pending = requests.find((r) => r.status === "PENDING");
  if (pending) {
    return (
      <span className="ms-2 inline-flex items-center gap-2 text-xs text-gray-500">
        {t("verification.pendingWith", { org: pending.organizationName })}
        <button
          onClick={() => onRevoke(pending.id)}
          className="text-gray-400 hover:text-red-600"
        >
          {t("verification.cancel")}
        </button>
      </span>
    );
  }

  const declined = requests.find((r) => r.status === "DECLINED");

  if (relationships.length === 0) {
    return declined ? (
      <span className="ms-2 text-xs text-gray-400">{t("verification.declined")}</span>
    ) : null;
  }

  return (
    <span className="ms-2 inline-flex flex-wrap items-center gap-1">
      {declined && (
        <span className="text-xs text-gray-400">{t("verification.declined")}</span>
      )}
      <select
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-xs"
      >
        <option value="">{t("verification.chooseOrg")}</option>
        {relationships.map((r) => (
          <option key={r.organizationId} value={r.organizationId}>
            {r.organizationName}
          </option>
        ))}
      </select>
      <button
        disabled={!orgId}
        onClick={() => orgId && onRequest(subjectType, subjectId, orgId)}
        className="text-xs text-brand hover:underline disabled:text-gray-300"
      >
        {t("verification.request")}
      </button>
    </span>
  );
}
