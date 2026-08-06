import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TEMPLATE_CATALOG } from "./catalog";
import type { TemplateConfig } from "./types";

/**
 * Cover letters (§23): what varies is the COUNTRY CONVENTION, not the design.
 * Axis 1 — layout (5, sharing the CV templates' look). Axis 2 — convention
 * (4 structural norms). 5×4 combinations through one renderer.
 */

export type LetterLayoutKey = "classic" | "modern" | "compact" | "academic" | "sidebar";
export const LETTER_LAYOUT_KEYS: readonly LetterLayoutKey[] = [
  "classic",
  "modern",
  "compact",
  "academic",
  "sidebar",
];

export type ConventionKey = "DE" | "FR" | "EN" | "AR";
export const CONVENTION_KEYS: readonly ConventionKey[] = ["DE", "FR", "EN", "AR"];

export type LetterBlockType =
  | "RECIPIENT"
  | "SUBJECT"
  | "SALUTATION"
  | "OPENING"
  | "BODY"
  | "CLOSING"
  | "SIGNATURE";

export interface LetterBlock {
  type: LetterBlockType;
  content: string;
}

export interface LetterDocument {
  /** Letter language (ISO 639-1) — may exceed platform locales, e.g. "de". */
  language: string;
  senderLines: string[];
  /** Pre-formatted by the caller (locale-aware), e.g. "Beirut, 06.08.2026". */
  dateLine: string;
  blocks: LetterBlock[];
}

interface ConventionConfig {
  key: ConventionKey;
  /** true: date renders before the recipient block (EN/AR business letter);
   * false: date follows the recipient block (DE DIN 5008, FR). */
  dateBeforeRecipient: boolean;
  /** Alignment of the date line within the page flow (logical: start/end). */
  dateAlign: "start" | "end";
  recipientAlign: "start" | "end";
  /** Prefix belonging to the norm itself (e.g. French "Objet : ") — norm
   * structure, not translatable UI copy. */
  subjectPrefix: string | null;
  subjectBold: boolean;
}

/** §23 conventions as data. */
export const CONVENTIONS: Record<ConventionKey, ConventionConfig> = {
  DE: {
    key: "DE",
    dateBeforeRecipient: false,
    dateAlign: "end",
    recipientAlign: "start",
    subjectPrefix: null,
    subjectBold: true, // DIN 5008: bold subject line, no "Betreff:" prefix
  },
  FR: {
    key: "FR",
    dateBeforeRecipient: false,
    dateAlign: "end",
    recipientAlign: "end",
    subjectPrefix: "Objet : ",
    subjectBold: false,
  },
  EN: {
    key: "EN",
    dateBeforeRecipient: true,
    dateAlign: "start",
    recipientAlign: "start",
    subjectPrefix: null,
    subjectBold: true,
  },
  AR: {
    key: "AR",
    dateBeforeRecipient: true,
    dateAlign: "start",
    recipientAlign: "start",
    subjectPrefix: null,
    subjectBold: true,
  },
};

function letterDirection(language: string): "rtl" | "ltr" {
  return language === "ar" ? "rtl" : "ltr";
}

function firstBlock(doc: LetterDocument, type: LetterBlockType): string | null {
  const block = doc.blocks.find((b) => b.type === type && b.content.trim() !== "");
  return block ? block.content : null;
}

export function LetterView({
  doc,
  convention,
}: {
  doc: LetterDocument;
  convention: ConventionConfig;
}): ReactElement {
  const recipient = firstBlock(doc, "RECIPIENT");
  const subject = firstBlock(doc, "SUBJECT");
  const salutation = firstBlock(doc, "SALUTATION");
  const closing = firstBlock(doc, "CLOSING");
  const signature = firstBlock(doc, "SIGNATURE");
  const paragraphs = doc.blocks.filter(
    (b) => (b.type === "OPENING" || b.type === "BODY") && b.content.trim() !== "",
  );

  const dateEl = (
    <p className="letter-date" style={{ textAlign: convention.dateAlign }}>
      {doc.dateLine}
    </p>
  );
  const recipientEl = recipient ? (
    <div
      className="letter-recipient"
      style={{ textAlign: convention.recipientAlign }}
    >
      {recipient.split("\n").map((line, i) => (
        <span key={i}>
          {line}
          <br />
        </span>
      ))}
    </div>
  ) : null;

  return (
    <div
      className="letter-root"
      dir={letterDirection(doc.language)}
      lang={doc.language}
    >
      <div className="letter-sender">
        {doc.senderLines.map((line, i) => (
          <span key={i}>
            {line}
            <br />
          </span>
        ))}
      </div>
      {convention.dateBeforeRecipient ? (
        <>
          {dateEl}
          {recipientEl}
        </>
      ) : (
        <>
          {recipientEl}
          {dateEl}
        </>
      )}
      {subject ? (
        <p
          className="letter-subject"
          style={{ fontWeight: convention.subjectBold ? 700 : 400 }}
        >
          {convention.subjectPrefix ?? ""}
          {subject}
        </p>
      ) : null}
      {salutation ? <p className="letter-salutation">{salutation}</p> : null}
      {paragraphs.map((block, i) => (
        <p key={i} className="letter-paragraph">
          {block.content}
        </p>
      ))}
      {closing ? <p className="letter-closing">{closing}</p> : null}
      {signature ? <p className="letter-signature">{signature}</p> : null}
    </div>
  );
}

/** Layouts reuse the CV catalog's typography/accent — one look per name (§23). */
function layoutConfig(layout: LetterLayoutKey): TemplateConfig {
  return TEMPLATE_CATALOG[layout];
}

export function buildLetterCss(layout: LetterLayoutKey): string {
  const { typography, accentColor } = layoutConfig(layout);
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #ffffff; }
.letter-root {
  font-family: ${typography.bodyFamily};
  font-size: ${typography.baseSizePt + 0.5}pt;
  color: #1f2937;
  line-height: 1.55;
  max-inline-size: 190mm;
  margin-inline: auto;
  padding: 20mm 20mm;
}
.letter-sender { color: #4b5563; font-size: ${typography.baseSizePt * 0.9}pt; margin-block-end: 10mm; }
.letter-recipient { margin-block-end: 8mm; }
.letter-date { margin-block-end: 8mm; }
.letter-subject { color: ${accentColor}; margin-block-end: 6mm; }
.letter-salutation { margin-block-end: 4mm; }
.letter-paragraph { margin-block-end: 4mm; }
.letter-closing { margin-block-start: 8mm; }
.letter-signature { margin-block-start: 10mm; font-family: ${typography.headingFamily}; }
@page { size: A4; margin: 0; }
`.trim();
}

export function renderCoverLetterHtml(
  doc: LetterDocument,
  layout: LetterLayoutKey,
  conventionKey: ConventionKey,
): string {
  const convention = CONVENTIONS[conventionKey];
  const markup = renderToStaticMarkup(
    <LetterView doc={doc} convention={convention} />,
  );
  return [
    "<!doctype html>",
    `<html lang="${doc.language}" dir="${letterDirection(doc.language)}">`,
    `<head><meta charset="utf-8"/><title>Cover letter</title>`,
    `<style>${buildLetterCss(layout)}</style></head>`,
    `<body>${markup}</body></html>`,
  ].join("");
}
