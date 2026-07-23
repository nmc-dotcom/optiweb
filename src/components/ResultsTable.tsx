import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import { severityBadgeClass } from "../lib/severityStyle";
import { PageDetailModal } from "./PageDetailModal";
import type { IssueCategory, IssueSeverity, ResourceType } from "../types";

type FilterKey =
  | "all"
  | "broken"
  | "redirect"
  | "image"
  | "external"
  | "internal"
  | "seo"
  | "a11y"
  | "standards";
const FILTERS: FilterKey[] = [
  "all",
  "broken",
  "redirect",
  "image",
  "external",
  "internal",
  "seo",
  "a11y",
  "standards",
];

type SeverityFilter = "all" | IssueSeverity;
const SEVERITY_FILTERS: SeverityFilter[] = ["all", "error", "warning", "info"];

type SortKey = "status" | "responseTimeMs" | "redirectCount";
type SortDir = "asc" | "desc";

/** One row = either a checked link/page (from linkResults) or an SEO/A11y/Standards finding
 * (from ruleIssues), merged at render time so the table can show/filter/sort both uniformly
 * without changing the underlying LinkResult/RuleIssueEntry shapes. */
interface UnifiedRow {
  id: string;
  pageUrl: string;
  sourcePage: string;
  targetUrl: string;
  status: number | null;
  issue: string;
  ruleId?: string;
  category: IssueCategory;
  severity: IssueSeverity;
  isBroken: boolean;
  isExternal: boolean;
  resourceType: ResourceType;
  redirectCount: number;
  responseTimeMs: number | null;
}

function matchesFilter(row: UnifiedRow, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "broken":
      return row.isBroken;
    case "redirect":
      return row.redirectCount > 0;
    case "image":
      return row.resourceType === "image";
    case "external":
      return row.isExternal;
    case "internal":
      return !row.isExternal;
    case "seo":
      return row.category === "seo";
    case "a11y":
      return row.category === "a11y";
    case "standards":
      return row.category === "standards";
  }
}

function sortValue(row: UnifiedRow, key: SortKey): number {
  if (key === "redirectCount") return row.redirectCount;
  if (key === "responseTimeMs") return row.responseTimeMs ?? -1;
  return row.status ?? -1;
}

export function ResultsTable() {
  const { t } = useI18n();
  const linkResults = useCrawlerStore((s) => s.linkResults);
  const ruleIssues = useCrawlerStore((s) => s.ruleIssues);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);

  const rows = useMemo<UnifiedRow[]>(() => {
    const fromLinks: UnifiedRow[] = linkResults.map((link) => ({
      id: link.id,
      pageUrl: link.targetUrl,
      sourcePage: link.sourceUrl || "(start)",
      targetUrl: link.targetUrl,
      status: link.status,
      issue: link.issue,
      category: link.category,
      severity: link.severity,
      isBroken: link.isBroken,
      isExternal: link.isExternal,
      resourceType: link.resourceType,
      redirectCount: link.redirectChain.length,
      responseTimeMs: link.responseTimeMs,
    }));

    const fromRules: UnifiedRow[] = ruleIssues.map((entry, index) => ({
      id: `rule-${index}-${entry.issue.ruleId}`,
      pageUrl: entry.pageUrl,
      sourcePage: entry.pageUrl,
      targetUrl: entry.pageUrl,
      status: null,
      issue: t(entry.issue.message, entry.issue.messageVars),
      ruleId: entry.issue.ruleId,
      category: entry.issue.category,
      severity: entry.issue.severity,
      isBroken: false,
      isExternal: false,
      resourceType: "page",
      redirectCount: 0,
      responseTimeMs: null,
    }));

    return [...fromLinks, ...fromRules];
  }, [linkResults, ruleIssues, t]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (severityFilter !== "all" && row.severity !== severityFilter)
        return false;
      if (!query) return true;
      return (
        row.targetUrl.toLowerCase().includes(query) ||
        row.issue.toLowerCase().includes(query)
      );
    });
    return [...filtered].sort((a, b) => {
      const diff = sortValue(a, sortKey) - sortValue(b, sortKey);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [rows, filter, severityFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            {t(`filter.${f}`)}
          </button>
        ))}

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SEVERITY_FILTERS.map((s) => (
            <option key={s} value={s}>
              {t(s === "all" ? "severity.all" : `severity.${s}`)}
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("table.search.placeholder")}
          className="ml-auto w-64 max-w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {filter === "a11y" && (
        <p className="rounded-md border border-terracotta/40 bg-accent/60 px-3 py-2 text-xs text-green-deep">
          {t("a11y.disclaimer")}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2">{t("table.sourcePage")}</th>
              <th className="px-3 py-2">{t("table.targetUrl")}</th>
              <th
                className="cursor-pointer px-3 py-2"
                onClick={() => toggleSort("status")}
              >
                {t("table.status")}
              </th>
              <th className="px-3 py-2">{t("table.issue")}</th>
              <th className="px-3 py-2">{t("table.category")}</th>
              <th
                className="cursor-pointer px-3 py-2"
                onClick={() => toggleSort("redirectCount")}
              >
                {t("table.redirectCount")}
              </th>
              <th
                className="cursor-pointer px-3 py-2"
                onClick={() => toggleSort("responseTimeMs")}
              >
                {t("table.responseTime")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {t("table.empty")}
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedPageUrl(row.pageUrl)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50"
              >
                <td
                  className="max-w-xs truncate px-3 py-2 text-muted-foreground"
                  title={row.sourcePage}
                >
                  {row.sourcePage}
                </td>
                <td
                  className="max-w-xs truncate px-3 py-2"
                  title={row.targetUrl}
                >
                  {row.targetUrl}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.status || "—"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {row.ruleId && (
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                        {row.ruleId}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(row.severity)}`}
                    >
                      {row.issue}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {t(`category.${row.category}`)}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.redirectCount}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.responseTimeMs !== null
                    ? `${row.responseTimeMs} ms`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedPageUrl && (
        <PageDetailModal
          pageUrl={selectedPageUrl}
          onClose={() => setSelectedPageUrl(null)}
        />
      )}
    </div>
  );
}
