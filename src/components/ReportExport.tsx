import { useState } from "react";
import { Download } from "lucide-react";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import { useI18n } from "../i18n";
import { downloadWorkbook, type ReportKind } from "../lib/reportWorkbook";

export function ReportExport() {
  const { t } = useI18n();
  const status = useCrawlerStore((state) => state.status);
  const [exporting, setExporting] = useState<ReportKind | null>(null);
  const [error, setError] = useState(false);

  async function handleDownload(kind: ReportKind) {
    setExporting(kind);
    setError(false);
    try {
      const state = useCrawlerStore.getState();
      await downloadWorkbook(
        kind,
        {
          config: state.config,
          pageResults: state.pageResults,
          linkResults: state.linkResults,
          ruleIssues: state.ruleIssues,
          summary: state.summary,
          browserAuditResults: state.browserAuditResults,
        },
        t,
      );
    } catch {
      setError(true);
    } finally {
      setExporting(null);
    }
  }

  if (status !== "done") return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-foreground">{t("report.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("report.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["developer", "manager"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={exporting !== null}
              onClick={() => void handleDownload(kind)}
              className="inline-flex items-center gap-2 rounded-full border border-primary bg-card px-4 py-2 text-sm font-semibold text-primary transition hover:bg-secondary disabled:cursor-wait disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden="true" />
              {exporting === kind
                ? t("report.exporting")
                : t(`report.${kind}.button`)}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("report.browser.notice")}
      </p>
      {error && (
        <p className="mt-2 text-sm text-destructive">{t("report.error")}</p>
      )}
    </section>
  );
}
