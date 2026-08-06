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
interface VerificationRow {
  subjectType: string;
  subjectId: string;
  status: string;
  organizationName: string;
}

export default function ProfilePage() {
  const { t } = useT();
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [educations, setEducations] = useState<Entry[]>([]);
  const [experiences, setExperiences] = useState<Entry[]>([]);
  const [languages, setLanguages] = useState<Entry[]>([]);
  const [skills, setSkills] = useState<Entry[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Record<string, string> | null>("/profile")
      .then((p) => setProfile(p ?? {}))
      .catch(() => undefined);
    api<Entry[]>("/educations").then(setEducations).catch(() => undefined);
    api<Entry[]>("/experiences").then(setExperiences).catch(() => undefined);
    api<Entry[]>("/languages").then(setLanguages).catch(() => undefined);
    api<Entry[]>("/skills").then(setSkills).catch(() => undefined);
    api<VerificationRow[]>("/verifications")
      .then(setVerifications)
      .catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  function badgeFor(subjectType: string, id: string) {
    const verified = verifications.find(
      (v) =>
        v.subjectType === subjectType && v.subjectId === id && v.status === "VERIFIED",
    );
    // §5: only VERIFIED is marked; everything else shows nothing at all.
    return verified ? (
      <VerifiedBadge
        label={t("verification.verifiedBy", { org: verified.organizationName })}
      />
    ) : null;
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

      <Card title={t("career.education")}>
        <EntryList
          entries={educations}
          render={(e) => (
            <>
              {String(e.degreeType)} — {String(e.institutionName)}{" "}
              {badgeFor("EDUCATION", e.id)}
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
              {badgeFor("EXPERIENCE", e.id)}
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
              {String(e.language)} — {String(e.level)} {badgeFor("LANGUAGE", e.id)}
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
