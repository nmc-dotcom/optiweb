export type IssueCategory = "seo" | "a11y" | "standards";
export type IssueSeverity = "error" | "warning" | "info";

/** Cross-page data needed by rules that compare pages against each other (duplicate title/description). */
export interface SiteIndex {
  titles: Map<string, string[]>;
  descriptions: Map<string, string[]>;
}

export function createEmptySiteIndex(): SiteIndex {
  return { titles: new Map(), descriptions: new Map() };
}

export interface RuleContext {
  /** DOMParser result for the page. */
  doc: Document;
  /** Final URL (post-redirect) of the page. */
  url: string;
  /** Raw HTML text — needed for checks a parser auto-corrects away (DOCTYPE, charset position). */
  html: string;
  /** Synthesized from the proxy's response (content-type, x-robots-tag) — not a full header set. */
  headers: Record<string, string>;
  siteIndex: SiteIndex;
}

export interface Issue {
  ruleId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  /** i18n key, resolved at render time. */
  message: string;
  /** Interpolation values for `message` (e.g. current length, duplicate count/URL). */
  messageVars?: Record<string, string | number>;
  wcag?: string;
  kwcag?: string;
  /** First ~150 chars of the offending element's outerHTML, for the page detail view. */
  element?: string;
  /** When the same issue fires multiple times on one page, collapsed into one Issue with a count. */
  count?: number;
}

export interface Rule {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  wcag?: string;
  kwcag?: string;
  check(ctx: RuleContext): Issue[];
}

const MAX_SNIPPET_LENGTH = 150;

/** First ~150 chars of an element's outerHTML, for showing "which element" in the UI. */
export function elementSnippet(
  el: Element | null | undefined,
): string | undefined {
  if (!el) return undefined;
  const html = el.outerHTML;
  return html.length > MAX_SNIPPET_LENGTH
    ? html.slice(0, MAX_SNIPPET_LENGTH) + "…"
    : html;
}

/**
 * Collapses same-rule issues into one Issue + count (spec: "동일 규칙이 한 페이지에서
 * 다발하면 Issue 1개 + count로 집계, element에는 첫 사례만"). `issues` must all share
 * `ruleId`/`category`/`severity`/`wcag`/`kwcag` — only `element`/`messageVars` may differ per instance.
 */
export function collapseIssues(issues: Issue[]): Issue[] {
  if (issues.length <= 1) return issues;
  const first = issues[0];
  if (!first) return issues;
  return [{ ...first, count: issues.length }];
}
