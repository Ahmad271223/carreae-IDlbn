"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Button, Card, ErrorText, Field, Input } from "../../../../components/ui";

interface Template {
  key: string;
  name: string;
  atsSafe: boolean;
  photoSlot: string;
}
interface Cv {
  id: string;
  title: string;
  templateKey: string;
  language: string;
}

export default function CvsPage() {
  const { locale, t } = useT();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [title, setTitle] = useState("");
  const [templateKey, setTemplateKey] = useState("classic");
  const [targetCountry, setTargetCountry] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const reload = useCallback(() => {
    api<Cv[]>("/cvs").then(setCvs).catch(() => undefined);
  }, []);
  useEffect(() => {
    api<Template[]>("/cvs/templates").then(setTemplates).catch(() => undefined);
    reload();
  }, [reload]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setWarning("");
    try {
      const result = await api<{
        cv: Cv;
        photoRecommendation: { warningKey?: string };
      }>("/cvs", {
        method: "POST",
        body: {
          title,
          templateKey,
          language: locale,
          targetCountryCode: targetCountry || undefined,
        },
      });
      // §20: discouraged markets warn — the user always decides.
      if (result.photoRecommendation.warningKey) {
        setWarning(
          t(result.photoRecommendation.warningKey, {
            country: targetCountry.toUpperCase(),
          }),
        );
      }
      // Pull the whole Career ID into the CV (§7.8 — reference, never copy).
      const [educations, experiences, languages, skills] = await Promise.all([
        api<Array<{ id: string }>>("/educations"),
        api<Array<{ id: string }>>("/experiences"),
        api<Array<{ id: string }>>("/languages"),
        api<Array<{ id: string }>>("/skills"),
      ]);
      const items = [
        ...experiences.map((e, i) => ({
          sourceType: "EXPERIENCE",
          sourceId: e.id,
          order: i,
          visible: true,
        })),
        ...educations.map((e, i) => ({
          sourceType: "EDUCATION",
          sourceId: e.id,
          order: 100 + i,
          visible: true,
        })),
        ...languages.map((e, i) => ({
          sourceType: "LANGUAGE",
          sourceId: e.id,
          order: 200 + i,
          visible: true,
        })),
        ...skills.map((e, i) => ({
          sourceType: "SKILL",
          sourceId: e.id,
          order: 300 + i,
          visible: true,
        })),
      ];
      await api(`/cvs/${result.cv.id}/items`, { method: "PUT", body: { items } });
      setTitle("");
      reload();
    } catch {
      setError(t("common.error"));
    }
  }

  async function render(cvId: string) {
    setRendering(cvId);
    setError("");
    try {
      const job = await api<{ jobId: string }>(`/cvs/${cvId}/render`, {
        method: "POST",
      });
      for (let i = 0; i < 60; i++) {
        const status = await api<{ status: string; documentId?: string }>(
          `/render-jobs/${job.jobId}`,
        );
        if (status.status === "SUCCEEDED" && status.documentId) {
          const { url } = await api<{ url: string }>(
            `/documents/${status.documentId}/download`,
          );
          window.open(url, "_blank", "noopener");
          return;
        }
        if (status.status === "FAILED") throw new Error("render failed");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("timeout");
    } catch {
      setError(t("common.error"));
    } finally {
      setRendering(null);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t("cv.title")}</h1>
      <Card title={t("cv.create")}>
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
              {t("cv.template")}
            </span>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              {templates.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {/* §19: ATS-unsafe templates are labeled honestly. */}
                  {tpl.name}
                  {tpl.atsSafe ? "" : ` — ${t("cv.atsUnsafe.label")}`}
                </option>
              ))}
            </select>
          </label>
          <div className="w-28">
            <Field label={t("cv.targetCountry")}>
              <Input
                value={targetCountry}
                maxLength={2}
                placeholder="DE"
                onChange={(e) => setTargetCountry(e.target.value.toUpperCase())}
              />
            </Field>
          </div>
          <Button type="submit">{t("cv.create")}</Button>
        </form>
        <p className="mt-2 text-xs text-gray-500">{t("cv.includeAll")}</p>
        {warning && <p className="mt-2 text-sm text-amber-700">{warning}</p>}
        <ErrorText>{error}</ErrorText>
      </Card>
      <Card title={t("cv.title")}>
        {cvs.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="space-y-1">
            {cvs.map((cv) => (
              <li
                key={cv.id}
                className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm"
              >
                <span>
                  {cv.title}
                  <span className="ms-2 text-xs text-gray-400">
                    {cv.templateKey} · {cv.language}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setEditing(editing === cv.id ? null : cv.id)}
                  >
                    {editing === cv.id ? t("cv.done") : t("cv.edit")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={rendering === cv.id}
                    onClick={() => render(cv.id)}
                  >
                    {rendering === cv.id ? t("cv.rendering") : t("cv.render")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <CvEditor key={editing} cvId={editing} />}
    </>
  );
}

interface CvItem {
  sourceType: string;
  sourceId: string | null;
  order: number;
  visible: boolean;
  displayOverride: Record<string, unknown> | null;
}

function CvEditor({ cvId }: { cvId: string }) {
  const { t } = useT();
  const [items, setItems] = useState<CvItem[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [photoEnabled, setPhotoEnabled] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<{ items: CvItem[]; photoEnabled: boolean }>(`/cvs/${cvId}`)
      .then((cv) => {
        setItems(cv.items);
        setPhotoEnabled(cv.photoEnabled);
      })
      .catch(() => setError(t("common.error")));
    // Resolve friendly labels for each referenced source entry.
    interface Ref {
      id: string;
      position?: string;
      companyName?: string;
      degreeType?: string;
      institutionName?: string;
      language?: string;
      level?: string;
      name?: string;
    }
    Promise.all([
      api<Ref[]>("/experiences"),
      api<Ref[]>("/educations"),
      api<Ref[]>("/languages"),
      api<Ref[]>("/skills"),
    ])
      .then(([exp, edu, lang, skill]) => {
        const map: Record<string, string> = {};
        exp.forEach((e) => (map[e.id] = `${e.position} — ${e.companyName}`));
        edu.forEach((e) => (map[e.id] = `${e.degreeType} — ${e.institutionName}`));
        lang.forEach((e) => (map[e.id] = `${e.language} (${e.level})`));
        skill.forEach((e) => (map[e.id] = e.name ?? ""));
        setLabels(map);
      })
      .catch(() => undefined);
  }, [cvId, t]);
  useEffect(load, [load]);

  function move(index: number, delta: number) {
    setItems((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function setDescription(index: number, value: string) {
    setItems((list) =>
      list.map((it, i) =>
        i === index
          ? { ...it, displayOverride: { ...(it.displayOverride ?? {}), description: value } }
          : it,
      ),
    );
  }

  async function save() {
    setError("");
    setSaved(false);
    try {
      await api(`/cvs/${cvId}/items`, {
        method: "PUT",
        body: {
          items: items.map((it, i) => ({
            sourceType: it.sourceType,
            sourceId: it.sourceId ?? undefined,
            // description is presentation-only — never locked by §22.
            displayOverride: cleanOverride(it.displayOverride),
            order: i,
            visible: it.visible,
          })),
        },
      });
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "VERIFIED_FIELD_LOCKED"
          ? t("cv.fieldLocked")
          : t("common.error"),
      );
    }
  }

  async function togglePhoto(next: boolean) {
    setPhotoEnabled(next);
    await api(`/cvs/${cvId}`, { method: "PATCH", body: { photoEnabled: next } }).catch(
      () => undefined,
    );
  }

  return (
    <Card title={t("cv.editItems")}>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={photoEnabled}
          onChange={(e) => togglePhoto(e.target.checked)}
        />
        {t("cv.photoEnabled")}
      </label>

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="rounded-md border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((it, i) =>
                        i === index ? { ...it, visible: e.target.checked } : it,
                      ),
                    )
                  }
                />
                <span className={item.visible ? "" : "text-gray-400 line-through"}>
                  {item.sourceId ? (labels[item.sourceId] ?? item.sourceType) : item.sourceType}
                </span>
                <span className="text-xs text-gray-400">
                  {t(`cv.section.${sectionKey(item.sourceType)}`)}
                </span>
              </label>
              <span className="flex gap-1">
                <button
                  onClick={() => move(index, -1)}
                  className="rounded px-1.5 text-gray-400 hover:bg-gray-100"
                  aria-label="up"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(index, 1)}
                  className="rounded px-1.5 text-gray-400 hover:bg-gray-100"
                  aria-label="down"
                >
                  ↓
                </button>
              </span>
            </div>
            {item.sourceType === "CREDENTIAL" ? (
              <p className="mt-2 text-xs text-gray-400">{t("cv.credentialLocked")}</p>
            ) : (
              <textarea
                value={String(item.displayOverride?.description ?? "")}
                onChange={(e) => setDescription(index, e.target.value)}
                rows={2}
                placeholder={t("cv.descriptionOverride")}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save}>{t("common.save")}</Button>
        {saved && <span className="text-sm text-verified">{t("letters.saved")}</span>}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** Drops empty overrides so an untouched item sends no override at all. */
function cleanOverride(
  override: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!override) return undefined;
  const entries = Object.entries(override).filter(
    ([, v]) => v !== "" && v !== null && v !== undefined,
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function sectionKey(sourceType: string): string {
  return (
    {
      EXPERIENCE: "experience",
      EDUCATION: "education",
      LANGUAGE: "languages",
      SKILL: "skills",
      CREDENTIAL: "certificates",
      CUSTOM: "profile",
    }[sourceType] ?? "profile"
  );
}
