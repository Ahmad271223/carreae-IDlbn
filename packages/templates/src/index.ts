export * from "./types";
export { TEMPLATE_CATALOG, TEMPLATE_KEYS, getTemplate } from "./catalog";
export { recommendPhoto, type PhotoRecommendation, type PhotoNorm } from "./photo-logic";
export { CvView, buildCss, renderCvHtml } from "./render";
export {
  CONVENTIONS,
  CONVENTION_KEYS,
  LETTER_LAYOUT_KEYS,
  LetterView,
  buildLetterCss,
  renderCoverLetterHtml,
  type ConventionKey,
  type LetterBlock,
  type LetterBlockType,
  type LetterDocument,
  type LetterLayoutKey,
} from "./letter";
