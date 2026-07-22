import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import type { LinkResult } from "../types";

type FilterKey =
  "all" | "broken" | "redirect" | "image" | "external" | "internal";
const FILTERS: FilterKey[] = [
  "all",
  "broken",
  "redirect",
  "image",
  "external",
  "internal",
];

type SortKey = "status" | "responseTimeMs" | "redirectCount";
type SortDir = "asc" | "desc";

function matchesFilter(link: LinkResult, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "broken":
      return link.isBroken;
    case "redirect":
      return link.redirectChain.length > 0;
    case "image":
      return link.resourceType === "image";
    case "external":
      return link.isExternal;
    case "internal":
      return !link.isExternal;
  }
}

function severityBadgeClass(severity: LinkResult["severity"]): string {
  switch (severity) {
    case "error":
      return "bg-destructive/10 text-destructive";
    case "warning":
      return "bg-warning/20 text-foreground";
    case "info":
      return "bg-muted text-muted-foreground";
  }
}

function sortValue(link: LinkResult, key: SortKey): number {
  if (key === "redirectCount") return link.redirectChain.length;
  if (key === "responseTimeMs") return link.responseTimeMs;
  return link.status;
}

export function ResultsTable() {
  const { t } = useI18n();
  const linkResults = useCrawlerStore((s) => s.linkResults);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = linkResults.filter((link) => {
      if (!matchesFilter(link, filter)) return false;
      if (!query) return true;
      return (
        link.targetUrl.toLowerCase().includes(query) ||
        link.issue.toLowerCase().includes(query)
      );
    });
    return [...filtered].sort((a, b) => {
      const diff = sortValue(a, sortKey) - sortValue(b, sortKey);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [linkResults, filter, search, sortKey, sortDir]);

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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("table.search.placeholder")}
          className="ml-auto w-64 max-w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

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
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {t("table.empty")}
                </td>
              </tr>
            )}
            {rows.map((link) => (
              <tr
                key={link.id}
                className="border-b border-border last:border-0 hover:bg-secondary/50"
              >
                <td
                  className="max-w-xs truncate px-3 py-2 text-muted-foreground"
                  title={link.sourceUrl || undefined}
                >
                  {link.sourceUrl || "(start)"}
                </td>
                <td
                  className="max-w-xs truncate px-3 py-2"
                  title={link.targetUrl}
                >
                  <a
                    href={link.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {link.targetUrl}
                  </a>
                </td>
                <td className="px-3 py-2 tabular-nums">{link.status || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(link.severity)}`}
                  >
                    {link.issue}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {t(`category.${link.category}`)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {link.redirectChain.length}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {link.responseTimeMs} ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
