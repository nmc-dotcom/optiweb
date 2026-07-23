import type { Rule } from "../types";
import { titleRule } from "./title";
import { titleLengthRule } from "./titleLength";
import { descriptionRule } from "./description";
import { descriptionLengthRule } from "./descriptionLength";
import { h1Rule } from "./h1";
import { h1MultiRule } from "./h1Multi";
import { canonicalRule } from "./canonical";
import { noindexRule } from "./noindex";
import { openGraphRule } from "./openGraph";

/** Per-page SEO rules. SEO-DUP-TITLE/SEO-DUP-DESC are not here — see ./duplicates.ts. */
export const seoRules: Rule[] = [
  titleRule,
  titleLengthRule,
  descriptionRule,
  descriptionLengthRule,
  h1Rule,
  h1MultiRule,
  canonicalRule,
  noindexRule,
  openGraphRule,
];

export { runDuplicateRules } from "./duplicates";
export type { DuplicateIssueEntry } from "./duplicates";
export { getTitleText, getMetaDescription } from "./shared";
