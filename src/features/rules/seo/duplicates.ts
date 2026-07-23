import type { Issue, SiteIndex } from "../types";

export interface DuplicateIssueEntry {
  pageUrl: string;
  issue: Issue;
}

function buildDuplicateIssues(
  index: Map<string, string[]>,
  ruleId: "SEO-DUP-TITLE" | "SEO-DUP-DESC",
): DuplicateIssueEntry[] {
  const entries: DuplicateIssueEntry[] = [];
  for (const urls of index.values()) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      const otherUrls = urls.filter((u) => u !== url);
      entries.push({
        pageUrl: url,
        issue: {
          ruleId,
          category: "seo",
          severity: "warning",
          message: `rules.${ruleId}.message`,
          messageVars: {
            count: otherUrls.length,
            otherUrls: otherUrls.join(", "),
          },
        },
      });
    }
  }
  return entries;
}

/**
 * SEO-DUP-TITLE / SEO-DUP-DESC. Unlike every other rule, these can't run per-page during
 * the crawl — the site index isn't complete until every page has been fetched — so this is
 * a dedicated batch pass `runCrawl` calls once after the crawl finishes, not part of the
 * uniform per-page `Rule[]` list `runRules.ts` executes.
 */
export function runDuplicateRules(siteIndex: SiteIndex): DuplicateIssueEntry[] {
  return [
    ...buildDuplicateIssues(siteIndex.titles, "SEO-DUP-TITLE"),
    ...buildDuplicateIssues(siteIndex.descriptions, "SEO-DUP-DESC"),
  ];
}
