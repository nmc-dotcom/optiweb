import { useI18n } from "../i18n";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import type { CrawlSummary } from "../types";

const CARD_KEYS: (keyof CrawlSummary)[] = [
  "pagesScanned",
  "brokenLinks",
  "redirects",
  "brokenImages",
  "a11yIssues",
  "standardsIssues",
];

export function SummaryCards() {
  const { t } = useI18n();
  const summary = useCrawlerStore((s) => s.summary);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {CARD_KEYS.map((key) => (
        <div
          key={key}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <p className="text-2xl font-bold text-foreground">{summary[key]}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(`summary.${key}`)}
          </p>
        </div>
      ))}
    </div>
  );
}
