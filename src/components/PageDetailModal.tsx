import { useI18n } from "../i18n";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import { severityBadgeClass } from "../lib/severityStyle";

interface PageDetailModalProps {
  pageUrl: string;
  onClose: () => void;
}

export function PageDetailModal({ pageUrl, onClose }: PageDetailModalProps) {
  const { t } = useI18n();
  const ruleIssues = useCrawlerStore((s) => s.ruleIssues);
  const pageResults = useCrawlerStore((s) => s.pageResults);
  const issues = ruleIssues
    .filter((entry) => entry.pageUrl === pageUrl)
    .map((entry) => entry.issue);
  const pageResult = pageResults.find((p) => p.url === pageUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">
              {t("detail.title")}
            </h2>
            <p
              className="truncate text-sm text-muted-foreground"
              title={pageUrl}
            >
              {pageUrl}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary"
          >
            {t("detail.close")}
          </button>
        </div>

        {pageResult?.ssoOutcome && (
          <div className="mb-4 rounded-md border border-border bg-secondary/60 p-3 text-sm">
            <p className="font-semibold text-foreground">
              {t("detail.sso.title")}
            </p>
            <p className="mt-1 text-muted-foreground">
              {t("detail.sso.outcome", {
                outcome: t(`detail.sso.kind.${pageResult.ssoOutcome}`),
              })}
            </p>
            {pageResult.ssoHops !== undefined && (
              <p className="text-muted-foreground">
                {t("detail.sso.hops", { hops: pageResult.ssoHops })}
              </p>
            )}
            {pageResult.ssoCookieDomains &&
              pageResult.ssoCookieDomains.length > 0 && (
                <div className="mt-1">
                  <p className="text-muted-foreground">
                    {t("detail.sso.cookieDomains")}
                  </p>
                  <ul className="mt-0.5 list-inside list-disc text-muted-foreground">
                    {pageResult.ssoCookieDomains.map((domain) => (
                      <li key={domain}>
                        {domain}: <span className="tracking-widest">***</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        )}

        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("detail.empty")}</p>
        ) : (
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
            {issues.map((issue, index) => (
              <li
                key={`${issue.ruleId}-${index}`}
                className="rounded-md border border-border p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">
                    {issue.ruleId}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(issue.severity)}`}
                  >
                    {t(`severity.${issue.severity}`)}
                  </span>
                  {issue.wcag && (
                    <span className="text-xs text-muted-foreground">
                      WCAG {issue.wcag}
                    </span>
                  )}
                  {issue.kwcag && (
                    <span className="text-xs text-muted-foreground">
                      KWCAG {issue.kwcag}
                    </span>
                  )}
                  {issue.count && issue.count > 1 && (
                    <span className="text-xs text-muted-foreground">
                      ×{issue.count}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground">
                  {t(issue.message, issue.messageVars)}
                </p>
                {issue.element && (
                  <pre className="mt-2 overflow-x-auto rounded bg-secondary p-2 text-xs">
                    <code>{issue.element}</code>
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
