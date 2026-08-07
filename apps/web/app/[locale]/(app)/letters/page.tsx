"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Button, Card, ErrorText, Field, Input } from "../../../../components/ui";

const LAYOUTS = ["classic", "modern", "compact", "academic", "sidebar"] as const;
const CONVENTIONS = ["DE", "FR", "EN", "AR"] as const;
const BLOCK_ORDER = [
  "RECIPIENT",
  "SUBJECT",
  "SALUTATION",
  "OPENING",
  "BODY",
  "CLOSING",
  "SIGNATURE",
] as const;
/** §28: only these blocks accept an AI draft — the AI writes prose, not headers. */
const DRAFTABLE = new Set(["OPENING", "BODY", "CLOSING"]);

interface Letter {
  id: string;
  title: string;
  layoutTemplate: string;
  convention: string;
  language: string;
}
interface Block {
  id: string;
  type: string;
  order: number;
  content: string;
  origin: string;
  draftContent: string | null;
}
interface Warning {
  type: string;
  value: string;
  labelKey: string;
}
interface DraftResult {
  blockId: string;
  draft: string;
  warnings: Warning[];
  backTranslation?: { language: string; text: string; hintKey: string };
}

export default function LettersPage() {
  const { locale, t } = useT();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [title, setTitle] = useState("");
  const [layoutTemplate, setLayoutTemplate] = useState<string>("classic");
  const [convention, setConvention] = useState<string>("EN");
  const [language, setLanguage] = useState<string>(locale === "ar" ? "en" : locale);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Letter[]>("/cover-letters").then(setLetters).catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const letter = await api<Letter>("/cover-letters", {
        method: "POST",
        body: { title, layoutTemplate, convention, language },
      });
      setTitle("");
      reload();
      setSelected(letter.id);
    } catch {
      setError(t("common.error"));
    }
  }

  async function remove(id: string) {
    await api(`/cover-letters/${id}`, { method: "DELETE" }).catch(() => undefined);
    if (selected === id) setSelected(null);
    reload();
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand">{t("letters.title")}</h1>
      <Card title={t("letters.create")}>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label={t("apps.appTitle")}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
          </div>
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold text-ink/80">
              {t("letters.layout")}
            </span>
            <select
              value={layoutTemplate}
              onChange={(e) => setLayoutTemplate(e.target.value)}
              className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
            >
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {t(`letters.layout.${l}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold text-ink/80">
              {t("letters.convention")}
            </span>
            <select
              value={convention}
              onChange={(e) => setConvention(e.target.value)}
              className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-tint focus:outline-none"
            >
              {CONVENTIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`letters.convention.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="w-24">
            <Field label={t("letters.language")}>
              <Input
                value={language}
                maxLength={2}
                placeholder="de"
                onChange={(e) => setLanguage(e.target.value.toLowerCase())}
              />
            </Field>
          </div>
          <Button type="submit">{t("letters.create")}</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Card>

      <Card title={t("letters.title")}>
        {letters.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="space-y-1">
            {letters.map((letter) => (
              <li
                key={letter.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
              >
                <span>
                  {letter.title}
                  <span className="ms-2 text-xs text-gray-400">
                    {t(`letters.convention.${letter.convention}`)} · {letter.language}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setSelected(selected === letter.id ? null : letter.id)
                    }
                  >
                    {selected === letter.id ? t("letters.close") : t("letters.edit")}
                  </Button>
                  <button
                    onClick={() => remove(letter.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    {t("common.remove")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected && <LetterEditor key={selected} letterId={selected} />}
    </>
  );
}

function LetterEditor({ letterId }: { letterId: string }) {
  const { t } = useT();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [jobDescription, setJobDescription] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<Letter & { blocks: Block[] }>(`/cover-letters/${letterId}`)
      .then((letter) => {
        const ordered = [...letter.blocks].sort(
          (a, b) => BLOCK_ORDER.indexOf(a.type as never) - BLOCK_ORDER.indexOf(b.type as never),
        );
        setBlocks(ordered);
        setContents(Object.fromEntries(ordered.map((b) => [b.id, b.content])));
      })
      .catch(() => setError(t("common.error")));
  }, [letterId, t]);
  useEffect(load, [load]);

  async function save() {
    setError("");
    setSaved(false);
    try {
      await api(`/cover-letters/${letterId}/blocks`, {
        method: "PUT",
        body: {
          blocks: blocks.map((b) => ({
            id: b.id,
            type: b.type,
            order: b.order,
            content: contents[b.id] ?? "",
          })),
        },
      });
      setSaved(true);
    } catch {
      setError(t("common.error"));
    }
  }

  async function draft(blockId: string) {
    setBusy(blockId);
    setError("");
    try {
      const result = await api<DraftResult>(
        `/cover-letters/${letterId}/blocks/${blockId}/draft`,
        { method: "POST", body: { jobDescription: jobDescription || undefined } },
      );
      setDrafts((d) => ({ ...d, [blockId]: result }));
    } catch (e) {
      // §31: AI provider not configured surfaces as its own message.
      setError(
        e instanceof Error && e.message === "AI_UNAVAILABLE"
          ? t("letters.aiUnavailable")
          : t("common.error"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function adopt(blockId: string) {
    await api(`/cover-letters/${letterId}/blocks/${blockId}/adopt`, {
      method: "POST",
    }).catch(() => undefined);
    setDrafts((d) => {
      const next = { ...d };
      delete next[blockId];
      return next;
    });
    load();
  }

  async function discard(blockId: string) {
    await api(`/cover-letters/${letterId}/blocks/${blockId}/draft/discard`, {
      method: "POST",
    }).catch(() => undefined);
    setDrafts((d) => {
      const next = { ...d };
      delete next[blockId];
      return next;
    });
  }

  async function render() {
    setRendering(true);
    setError("");
    try {
      const job = await api<{ jobId: string }>(`/cover-letters/${letterId}/render`, {
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
      setRendering(false);
    }
  }

  return (
    <Card
      title={t("letters.blocks")}
      actions={
        <Button variant="secondary" disabled={rendering} onClick={render}>
          {rendering ? t("letters.rendering") : t("letters.render")}
        </Button>
      }
    >
      <Field label={t("letters.jobDescription")}>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm transition-all focus:border-brand-tint focus:outline-none"
          placeholder={t("letters.jobDescription.hint")}
        />
      </Field>

      <div className="mt-4 space-y-4">
        {blocks.map((block) => {
          const d = drafts[block.id];
          return (
            <div key={block.id} className="rounded-xl border border-line bg-white p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t(`letters.block.${block.type}`)}
                </span>
                {block.origin !== "USER" && (
                  <span className="text-xs text-gray-400">
                    {t(`letters.origin.${block.origin}`)}
                  </span>
                )}
              </div>
              <textarea
                value={contents[block.id] ?? ""}
                onChange={(e) =>
                  setContents((c) => ({ ...c, [block.id]: e.target.value }))
                }
                rows={block.type === "BODY" ? 5 : 2}
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm transition-all focus:border-brand-tint focus:outline-none"
              />
              {DRAFTABLE.has(block.type) && (
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    disabled={busy === block.id}
                    onClick={() => draft(block.id)}
                  >
                    {busy === block.id ? t("common.loading") : t("letters.aiDraft")}
                  </Button>
                </div>
              )}
              {d && (
                <div className="mt-2 rounded-xl border border-amber-200/60 bg-amber-50 p-4 text-sm">
                  <p className="whitespace-pre-wrap">{d.draft}</p>
                  {d.warnings.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
                      {d.warnings.map((w, i) => (
                        <li key={i}>
                          “{w.value}” — {t(w.labelKey)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.backTranslation && (
                    <div className="mt-2 border-t border-amber-200 pt-2 text-xs text-amber-800">
                      <p className="mb-1">{t(d.backTranslation.hintKey)}</p>
                      <p className="whitespace-pre-wrap italic">
                        {d.backTranslation.text}
                      </p>
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button onClick={() => adopt(block.id)}>{t("letters.adopt")}</Button>
                    <Button variant="secondary" onClick={() => discard(block.id)}>
                      {t("letters.discard")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save}>{t("common.save")}</Button>
        {saved && <span className="text-sm text-verified">{t("letters.saved")}</span>}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
