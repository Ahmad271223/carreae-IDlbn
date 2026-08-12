"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import {
  EmployerPicker,
  UniversityPicker,
} from "../../../../components/university-picker";
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
      <h1 className="text-3xl font-extrabold tracking-tight text-brand">{t("profile.title")}</h1>
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
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
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
          detail={(e) =>
            [e.fieldOfStudy, e.grade].filter(Boolean).map(String).join(" · ")
          }
        />
        <AddEducationForm
          onAdd={(values) => addEntry("/educations", values)}
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
          detail={(e) =>
            [
              e.employmentType ? t(`career.type.${String(e.employmentType)}`) : "",
              e.location,
            ]
              .filter(Boolean)
              .map(String)
              .join(" · ")
          }
        />
        <AddExperienceForm onAdd={(values) => addEntry("/experiences", values)} />
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
  detail,
}: {
  entries: Entry[];
  render: (entry: Entry) => React.ReactNode;
  onRemove: (id: string) => void;
  removeLabel: string;
  /** Optional secondary line, e.g. field of study · grade. */
  detail?: (entry: Entry) => string;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="mb-3 space-y-1">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
        >
          <span>
            {render(entry)}
            {detail?.(entry) && (
              <span className="mt-0.5 block text-xs text-muted">{detail(entry)}</span>
            )}
          </span>
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
        className="rounded-lg border border-line bg-white px-2 py-1 text-xs shadow-sm"
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

/**
 * Education entry: institution comes from the searchable picker (which
 * prefills the country), everything else the person writes themselves —
 * field of study and grade are free text because grading systems differ
 * per country and must not be forced into our vocabulary.
 */
function AddEducationForm({
  onAdd,
}: {
  onAdd: (values: Record<string, unknown>) => void;
}) {
  const { t } = useT();
  const [institutionName, setInstitutionName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [degreeType, setDegreeType] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [grade, setGrade] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ongoing, setOngoing] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onAdd({
      institutionName,
      countryCode: countryCode.toUpperCase(),
      degreeType,
      fieldOfStudy: fieldOfStudy || undefined,
      grade: grade || undefined,
      startDate,
      endDate: ongoing || !endDate ? undefined : endDate,
    });
    setInstitutionName("");
    setCountryCode("");
    setDegreeType("");
    setFieldOfStudy("");
    setGrade("");
    setStartDate("");
    setEndDate("");
    setOngoing(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t("career.institution")}>
          <UniversityPicker
            value={institutionName}
            onChange={setInstitutionName}
            onCountryChange={setCountryCode}
          />
        </Field>
      </div>
      <Field label={t("career.degree")}>
        <Input
          value={degreeType}
          onChange={(e) => setDegreeType(e.target.value)}
          placeholder={t("career.degree.placeholder")}
          required
        />
      </Field>
      <Field label={t("career.fieldOfStudy")}>
        <Input
          value={fieldOfStudy}
          onChange={(e) => setFieldOfStudy(e.target.value)}
          placeholder={t("career.fieldOfStudy.placeholder")}
        />
      </Field>
      <Field label={t("career.startDate")}>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </Field>
      <Field label={t("career.endDate")}>
        <Input
          type="date"
          value={endDate}
          disabled={ongoing}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </Field>
      <Field label={t("career.grade")}>
        <Input
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          placeholder={t("career.grade.placeholder")}
        />
      </Field>
      <div className="w-24">
        <Field label={t("profile.country")}>
          <Input
            value={countryCode}
            maxLength={2}
            placeholder="LB"
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            required
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={ongoing}
          onChange={(e) => setOngoing(e.target.checked)}
        />
        {t("career.ongoing")}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={!institutionName}>
          {t("common.add")}
        </Button>
      </div>
    </form>
  );
}

const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "INTERNSHIP",
  "VOLUNTEER",
  "FREELANCE",
] as const;

/**
 * Work experience entry. The employer comes from the picker (verified
 * organizations on the platform are suggested, because only those can later
 * confirm the entry) or is typed freely; the employment type is explicit so
 * internships and volunteering are first-class, not disguised full-time jobs.
 */
function AddExperienceForm({
  onAdd,
}: {
  onAdd: (values: Record<string, unknown>) => void;
}) {
  const { t } = useT();
  const [companyName, setCompanyName] = useState("");
  const [position, setPosition] = useState("");
  const [employmentType, setEmploymentType] = useState<string>("FULL_TIME");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ongoing, setOngoing] = useState(false);
  const [description, setDescription] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onAdd({
      companyName,
      position,
      employmentType,
      location: location || undefined,
      startDate,
      endDate: ongoing || !endDate ? undefined : endDate,
      description: description || undefined,
    });
    setCompanyName("");
    setPosition("");
    setEmploymentType("FULL_TIME");
    setLocation("");
    setStartDate("");
    setEndDate("");
    setOngoing(false);
    setDescription("");
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t("career.company")}>
          <EmployerPicker value={companyName} onChange={setCompanyName} />
        </Field>
      </div>
      <Field label={t("career.position")}>
        <Input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder={t("career.position.placeholder")}
          required
        />
      </Field>
      <label className="block text-sm">
        <span className="mb-1.5 block font-semibold text-ink/80">
          {t("career.employmentType")}
        </span>
        <select
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value)}
          className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
        >
          {EMPLOYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`career.type.${type}`)}
            </option>
          ))}
        </select>
      </label>
      <Field label={t("career.startDate")}>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </Field>
      <Field label={t("career.endDate")}>
        <Input
          type="date"
          value={endDate}
          disabled={ongoing}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("career.location")}>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("career.location.placeholder")}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={t("career.description")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("career.description.placeholder")}
            className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm transition-all focus:border-brand-tint focus:outline-none"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={ongoing}
          onChange={(e) => setOngoing(e.target.checked)}
        />
        {t("career.stillWorking")}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={!companyName}>
          {t("common.add")}
        </Button>
      </div>
    </form>
  );
}
