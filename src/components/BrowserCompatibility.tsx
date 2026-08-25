import { useCallback, useEffect, useState } from "react";
import { MonitorCheck, RefreshCw } from "lucide-react";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import { useI18n } from "../i18n";
import type { BrowserAuditResult, BrowserName } from "../types";
import {
  getBrowserRunnerHealth,
  runBrowserAudit,
  type BrowserRunnerHealth,
} from "../lib/browserAudit";

const BROWSERS: BrowserName[] = ["chrome", "edge", "whale"];

function aggregate(
  results: BrowserAuditResult[],
  field: "functionalStatus" | "visualStatus",
) {
  if (
    results.length === 0 ||
    results.every((result) => result[field] === "unavailable")
  )
    return "unavailable";
  if (results.some((result) => result[field] === "fail")) return "fail";
  if (results.some((result) => result[field] === "unavailable"))
    return "unavailable";
  return "pass";
}

export function BrowserCompatibility() {
  const { t } = useI18n();
  const crawlStatus = useCrawlerStore((state) => state.status);
  const auditStatus = useCrawlerStore((state) => state.browserAuditStatus);
  const progress = useCrawlerStore((state) => state.browserAuditProgress);
  const results = useCrawlerStore((state) => state.browserAuditResults);
  const pageResults = useCrawlerStore((state) => state.pageResults);
  const [health, setHealth] = useState<BrowserRunnerHealth | null>(null);
  const [healthState, setHealthState] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await getBrowserRunnerHealth());
      setHealthState("ready");
    } catch {
      setHealth(null);
      setHealthState("unavailable");
    }
  }, []);

  useEffect(() => {
    if (crawlStatus === "idle" || auditStatus === "idle") return;
    const timeout = globalThis.setTimeout(() => void loadHealth(), 0);
    return () => globalThis.clearTimeout(timeout);
  }, [auditStatus, crawlStatus, loadHealth]);

  const refreshHealth = useCallback(() => {
    setHealthState("checking");
    void loadHealth();
  }, [loadHealth]);

  const retryAudit = useCallback(async () => {
    const urls = pageResults
      .filter(
        (page) =>
          !page.blockedByRobots && page.status >= 200 && page.status < 400,
      )
      .map((page) => page.url);
    const store = useCrawlerStore.getState();
    store.setBrowserAuditResults([]);
    store.setBrowserAuditStatus("running");
    store.setBrowserAuditProgress({ completed: 0, total: urls.length });
    const audit = await runBrowserAudit(urls, 300_000, (nextProgress) =>
      store.setBrowserAuditProgress(nextProgress),
    );
    store.setBrowserAuditResults(audit.results);
    store.setBrowserAuditStatus(audit.available ? "done" : "unavailable");
    await loadHealth();
  }, [loadHealth, pageResults]);

  if (crawlStatus === "idle" || auditStatus === "idle") return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MonitorCheck className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-bold text-foreground">{t("browser.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {auditStatus === "running"
                ? t("browser.progress", {
                    completed: progress.completed,
                    total: progress.total,
                  })
                : auditStatus === "unavailable"
                  ? t("browser.unavailable")
                  : t("browser.completed", { count: results.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {healthState === "checking"
              ? t("browser.runner.checking")
              : healthState === "unavailable"
                ? t("browser.runner.unavailable")
                : health?.busy
                  ? t("browser.runner.busy")
                  : t("browser.runner.ready")}
          </span>
          <button
            type="button"
            onClick={refreshHealth}
            disabled={healthState === "checking"}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw
              className={`size-3.5 ${healthState === "checking" ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {t("browser.refresh")}
          </button>
          {auditStatus === "unavailable" && (
            <button
              type="button"
              onClick={() => void retryAudit()}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("browser.retry")}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">{t("browser.name")}</th>
              <th className="w-32 px-3 py-2">{t("browser.runtime")}</th>
              <th className="w-32 px-3 py-2">{t("browser.functional")}</th>
              <th className="w-32 px-3 py-2">{t("browser.visual")}</th>
              <th className="w-28 px-3 py-2 text-right">
                {t("browser.issueCount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {BROWSERS.map((browser) => {
              const matches = results.filter(
                (result) => result.browser === browser,
              );
              const functional = aggregate(matches, "functionalStatus");
              const visual = aggregate(matches, "visualStatus");
              const issueCount = matches.reduce(
                (count, result) => count + result.issues.length,
                0,
              );
              const capability = health?.browsers.find(
                (item) => item.browser === browser,
              );
              const version = matches.find(
                (result) => result.browserVersion,
              )?.browserVersion;
              return (
                <tr
                  key={browser}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 font-medium capitalize">
                    {browser}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {version ??
                      (capability?.installed
                        ? t("browser.installed")
                        : t("browser.notInstalled"))}
                  </td>
                  <td className="px-3 py-2">
                    {t(`report.status.${functional}`)}
                  </td>
                  <td className="px-3 py-2">{t(`report.status.${visual}`)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {issueCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("browser.safeNotice")}
      </p>
    </section>
  );
}
