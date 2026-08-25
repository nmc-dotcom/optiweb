import type { SheetData } from "write-excel-file/browser";
import type { RuleIssueEntry } from "../features/crawler/useCrawlerStore";
import type {
  BrowserAuditResult,
  BrowserName,
  CrawlConfig,
  CrawlSummary,
  LinkResult,
  PageResult,
} from "../types";

export type ReportKind = "developer" | "manager";
export type ReportCheckStatus = "pass" | "fail" | "not-run" | "unavailable";

type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export interface ReportSnapshot {
  config: CrawlConfig | null;
  pageResults: PageResult[];
  linkResults: LinkResult[];
  ruleIssues: RuleIssueEntry[];
  summary: CrawlSummary;
  browserAuditResults?: BrowserAuditResult[];
}

export interface WorkbookSheet {
  sheet: string;
  data: SheetData;
  columns: { width: number }[];
  stickyRowsCount?: number;
  stickyColumnsCount?: number;
  orientation?: "landscape";
  showGridLines?: boolean;
}

const HEADER = {
  fontWeight: "bold" as const,
  backgroundColor: "#2F6B4F",
  textColor: "#FFFFFF",
  align: "center" as const,
};

const SECTION = {
  fontWeight: "bold" as const,
  backgroundColor: "#ECE4D2",
};

const NON_STANDARD_RULES = new Set([
  "S4",
  "S5",
  "S10",
  "S11",
  "S12",
  "CSS-LEGACY",
  "CSS-PREFIX",
]);

function header(values: string[]): SheetData[number] {
  return values.map((value) => ({ value, ...HEADER }));
}

function safeText(value: string | undefined): string {
  if (!value) return "";
  return value.length > 32_000 ? `${value.slice(0, 32_000)}…` : value;
}

function categoryLabel(category: string, t: Translate): string {
  return t(`category.${category}`);
}

function severityLabel(severity: string, t: Translate): string {
  return t(`severity.${severity}`);
}

function statusLabel(status: ReportCheckStatus, t: Translate): string {
  return t(`report.status.${status}`);
}

function hasActionableSeverity(severity: string): boolean {
  return severity === "error" || severity === "warning";
}

function isUnavailable(entry: RuleIssueEntry): boolean {
  return entry.issue.message === "rules.W3C.unavailable";
}

function isValid(entry: RuleIssueEntry): boolean {
  return entry.issue.message === "rules.W3C.valid";
}

function w3cStatus(
  ruleId: "W3C-HTML" | "W3C-CSS",
  entries: RuleIssueEntry[],
): ReportCheckStatus {
  const matches = entries.filter((entry) => entry.issue.ruleId === ruleId);
  if (matches.some((entry) => hasActionableSeverity(entry.issue.severity)))
    return "fail";
  if (matches.some(isValid)) return "pass";
  if (matches.length > 0 && matches.every(isUnavailable)) return "unavailable";
  return "not-run";
}

function checkRow(
  category: string,
  item: string,
  status: ReportCheckStatus,
  evidence: string,
  t: Translate,
): SheetData[number] {
  const color =
    status === "pass" ? "#E1EFE7" : status === "fail" ? "#F8DEDA" : "#F3EEE0";
  return [
    category,
    item,
    {
      value: statusLabel(status, t),
      fontWeight: "bold",
      backgroundColor: color,
    },
    evidence,
  ];
}

function checkedPageCount(snapshot: ReportSnapshot): number {
  return new Set(snapshot.pageResults.map((page) => page.url)).size;
}

function actionableRuleEntries(snapshot: ReportSnapshot): RuleIssueEntry[] {
  return snapshot.ruleIssues.filter(
    (entry) =>
      hasActionableSeverity(entry.issue.severity) &&
      !isValid(entry) &&
      !isUnavailable(entry),
  );
}

function actionableLinkEntries(snapshot: ReportSnapshot): LinkResult[] {
  return snapshot.linkResults.filter(
    (entry) => entry.isBroken || hasActionableSeverity(entry.severity),
  );
}

function buildDeveloperIssueSheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const rows: SheetData = [
    header([
      "이슈 ID",
      "우선순위",
      "대상 URL",
      "관련 URL",
      "분류",
      "규칙 ID",
      "수정 요청",
      "요소/코드",
      "발생 수",
      "HTTP 상태",
      "리다이렉트 수",
      "응답 시간(ms)",
      "WCAG",
      "KWCAG",
      "처리 상태",
      "담당자",
      "조치 내용",
      "완료 예정일",
      "재점검 결과",
    ]),
  ];

  let sequence = 1;
  for (const entry of actionableLinkEntries(snapshot)) {
    rows.push([
      `LINK-${String(sequence++).padStart(4, "0")}`,
      entry.severity === "error" ? "높음" : "보통",
      entry.targetUrl,
      entry.sourceUrl,
      categoryLabel(entry.category, t),
      "HTTP/LINK",
      entry.issue,
      "",
      1,
      entry.status || "",
      entry.redirectChain.length,
      entry.responseTimeMs,
      "",
      "",
      "미처리",
      "",
      "",
      "",
      "",
    ]);
  }

  for (const entry of actionableRuleEntries(snapshot)) {
    const issue = entry.issue;
    rows.push([
      `RULE-${String(sequence++).padStart(4, "0")}`,
      issue.severity === "error" ? "높음" : "보통",
      entry.pageUrl,
      "",
      categoryLabel(issue.category, t),
      issue.ruleId,
      t(issue.message, issue.messageVars),
      safeText(issue.element),
      issue.count ?? 1,
      "",
      "",
      "",
      issue.wcag ?? "",
      issue.kwcag ?? "",
      "미처리",
      "",
      "",
      "",
      "",
    ]);
  }

  if (rows.length === 1) {
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "자동 수정이 필요한 오류 또는 경고가 발견되지 않았습니다.",
    ]);
  }

  return {
    sheet: "수정 요청 목록",
    data: rows,
    columns: [
      12, 10, 42, 42, 12, 16, 48, 42, 10, 12, 12, 14, 12, 12, 12, 12, 32, 14,
      18,
    ].map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 3,
    orientation: "landscape",
  };
}

function buildUrlStatusSheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const issueCounts = new Map<string, { error: number; warning: number }>();
  for (const entry of actionableRuleEntries(snapshot)) {
    const current = issueCounts.get(entry.pageUrl) ?? { error: 0, warning: 0 };
    current[entry.issue.severity as "error" | "warning"] +=
      entry.issue.count ?? 1;
    issueCounts.set(entry.pageUrl, current);
  }

  const rows: SheetData = [
    header([
      "대상 URL",
      "HTTP 상태",
      "응답 시간(ms)",
      "리다이렉트 수",
      "오류",
      "경고",
      "robots 차단",
      "인증 필요",
      "점검 시각",
    ]),
  ];
  for (const page of snapshot.pageResults) {
    const count = issueCounts.get(page.url) ?? { error: 0, warning: 0 };
    rows.push([
      page.url,
      page.status || "",
      page.responseTimeMs,
      page.redirectChain.length,
      count.error,
      count.warning,
      page.blockedByRobots ? t("report.yes") : t("report.no"),
      page.requiresAuth ? t("report.yes") : t("report.no"),
      new Date(page.discoveredAt),
    ]);
  }
  return {
    sheet: "URL별 현황",
    data: rows,
    columns: [55, 12, 14, 14, 10, 10, 12, 12, 22].map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
    orientation: "landscape",
  };
}

function buildRuleGuideSheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const seen = new Set<string>();
  const rows: SheetData = [
    header(["규칙 ID", "분류", "심각도", "점검 내용", "WCAG", "KWCAG"]),
  ];
  for (const entry of snapshot.ruleIssues) {
    const issue = entry.issue;
    const key = `${issue.ruleId}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push([
      issue.ruleId,
      categoryLabel(issue.category, t),
      severityLabel(issue.severity, t),
      t(issue.message, issue.messageVars),
      issue.wcag ?? "",
      issue.kwcag ?? "",
    ]);
  }
  return {
    sheet: "규칙 설명",
    data: rows,
    columns: [18, 14, 12, 64, 14, 14].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

function buildBrowserDetailSheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const rows: SheetData = [
    header([
      "대상 URL",
      "브라우저",
      "버전",
      "기능 호환성",
      "화면 표시 호환성",
      "뷰포트",
      "이슈 유형",
      "상세 내용",
      "점검 시간(ms)",
      "점검 시각",
    ]),
  ];
  for (const result of snapshot.browserAuditResults ?? []) {
    const viewports = result.viewports
      .map(
        (viewport) => `${viewport.name} ${viewport.width}×${viewport.height}`,
      )
      .join(", ");
    if (result.issues.length === 0) {
      rows.push([
        result.url,
        result.browser,
        result.browserVersion ?? "",
        statusLabel(result.functionalStatus, t),
        statusLabel(result.visualStatus, t),
        viewports,
        "",
        result.unavailableReason ?? "",
        result.durationMs,
        new Date(result.checkedAt),
      ]);
      continue;
    }
    for (const issue of result.issues) {
      rows.push([
        result.url,
        result.browser,
        result.browserVersion ?? "",
        statusLabel(result.functionalStatus, t),
        statusLabel(result.visualStatus, t),
        issue.viewport ?? viewports,
        issue.kind,
        safeText(issue.message),
        result.durationMs,
        new Date(result.checkedAt),
      ]);
    }
  }
  if (rows.length === 1) rows.push(["", "", "", t("report.status.not-run")]);
  return {
    sheet: "브라우저 호환성 상세",
    data: rows,
    columns: [52, 12, 18, 16, 20, 24, 22, 62, 16, 22].map((width) => ({
      width,
    })),
    stickyRowsCount: 1,
    stickyColumnsCount: 2,
    orientation: "landscape",
  };
}

export function buildDeveloperWorkbook(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet[] {
  return [
    buildDeveloperIssueSheet(snapshot, t),
    buildUrlStatusSheet(snapshot, t),
    buildBrowserDetailSheet(snapshot, t),
    buildRuleGuideSheet(snapshot, t),
  ];
}

function browserStatus(
  snapshot: ReportSnapshot,
  browser: BrowserName,
  field: "functionalStatus" | "visualStatus",
): ReportCheckStatus {
  const matches = (snapshot.browserAuditResults ?? []).filter(
    (result) => result.browser === browser,
  );
  if (matches.length === 0) return "not-run";
  if (matches.some((result) => result[field] === "fail")) return "fail";
  if (matches.some((result) => result[field] === "unavailable"))
    return "unavailable";
  return "pass";
}

function browserEvidence(
  snapshot: ReportSnapshot,
  browser: BrowserName,
  status: ReportCheckStatus,
  t: Translate,
): string {
  const matches = (snapshot.browserAuditResults ?? []).filter(
    (result) => result.browser === browser,
  );
  if (status === "not-run") return t("report.browser.notRunEvidence");
  if (status === "unavailable") {
    const reasons = [
      ...new Set(
        matches.map((result) => result.unavailableReason).filter(Boolean),
      ),
    ];
    return reasons.length > 0
      ? t("report.browser.unavailableEvidence", { reason: reasons.join(", ") })
      : t("report.browser.unavailableEvidence", {
          reason: "runner_unavailable",
        });
  }
  const issueCount = matches.reduce(
    (count, result) => count + result.issues.length,
    0,
  );
  return t("report.browser.completedEvidence", {
    pages: matches.length,
    issues: issueCount,
  });
}

function compatibilityRows(snapshot: ReportSnapshot, t: Translate): SheetData {
  const htmlStatus = w3cStatus("W3C-HTML", snapshot.ruleIssues);
  const cssStatus = w3cStatus("W3C-CSS", snapshot.ruleIssues);
  const nonStandardFindings = snapshot.ruleIssues.filter((entry) =>
    NON_STANDARD_RULES.has(entry.issue.ruleId),
  );
  const standardsFindings = snapshot.ruleIssues.filter(
    (entry) =>
      entry.issue.category === "standards" &&
      !entry.issue.ruleId.startsWith("W3C-") &&
      !isValid(entry) &&
      !isUnavailable(entry),
  );
  const hasPages = checkedPageCount(snapshot) > 0;
  const browsers: BrowserName[] = ["chrome", "edge", "whale"];

  return [
    header(["점검 영역", "세부 항목", "결과", "판정 근거"]),
    checkRow(
      "웹 표준 문법",
      "W3C HTML 문법",
      htmlStatus,
      t(`report.w3c.evidence.${htmlStatus}`),
      t,
    ),
    checkRow(
      "웹 표준 문법",
      "W3C CSS 문법",
      cssStatus,
      t(`report.w3c.evidence.${cssStatus}`),
      t,
    ),
    ...browsers.map((browser) => {
      const status = browserStatus(snapshot, browser, "functionalStatus");
      return checkRow(
        "기능 호환성",
        browser === "whale" ? "Whale" : browser === "edge" ? "Edge" : "Chrome",
        status,
        browserEvidence(snapshot, browser, status, t),
        t,
      );
    }),
    ...browsers.map((browser) => {
      const status = browserStatus(snapshot, browser, "visualStatus");
      return checkRow(
        "화면 표시 호환성",
        browser === "whale" ? "Whale" : browser === "edge" ? "Edge" : "Chrome",
        status,
        browserEvidence(snapshot, browser, status, t),
        t,
      );
    }),
    checkRow(
      "비표준 기술 제거",
      "비표준·레거시 기술 제거 여부",
      nonStandardFindings.length > 0 ? "fail" : hasPages ? "pass" : "not-run",
      t("report.findingCount", { count: nonStandardFindings.length }),
      t,
    ),
    checkRow(
      "비표준 기술 제거",
      "최신 웹 표준 사용 여부",
      standardsFindings.length > 0 ? "fail" : hasPages ? "pass" : "not-run",
      t("report.findingCount", { count: standardsFindings.length }),
      t,
    ),
  ];
}

function buildManagementSummarySheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const actionable = actionableRuleEntries(snapshot);
  const failedLinks = actionableLinkEntries(snapshot);
  const startedAt = snapshot.pageResults.length
    ? Math.min(...snapshot.pageResults.map((page) => page.discoveredAt))
    : Date.now();
  const rows: SheetData = [
    [{ value: t("report.manager.title"), ...HEADER, columnSpan: 4 }],
    [{ value: "점검 개요", ...SECTION, columnSpan: 4 }],
    ["기준 URL", snapshot.config?.startUrl ?? ""],
    ["점검 일시", new Date(startedAt)],
    ["점검 방식", t("report.safeScope")],
    ["점검 URL 수", checkedPageCount(snapshot)],
    ["오류·경고 수", actionable.length + failedLinks.length],
    ["깨진 링크", snapshot.summary.brokenLinks],
    ["깨진 이미지", snapshot.summary.brokenImages],
    ["리다이렉트", snapshot.summary.redirects],
    [{ value: "자동점검 범위", ...SECTION, columnSpan: 4 }],
    [t("report.safeScopeDetail"), ""],
    [t("report.uncheckedDisclaimer"), ""],
  ];
  return {
    sheet: "종합 요약",
    data: rows,
    columns: [26, 62, 18, 18].map((width) => ({ width })),
    showGridLines: false,
  };
}

function buildCategorySheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const categories = ["link", "seo", "a11y", "standards"];
  const rows: SheetData = [header(["분류", "오류", "경고", "합계"])];
  for (const category of categories) {
    const ruleMatches = snapshot.ruleIssues.filter(
      (entry) => entry.issue.category === category,
    );
    const linkMatches = snapshot.linkResults.filter(
      (entry) => entry.category === category,
    );
    const error =
      ruleMatches.filter((entry) => entry.issue.severity === "error").length +
      linkMatches.filter((entry) => entry.severity === "error").length;
    const warning =
      ruleMatches.filter((entry) => entry.issue.severity === "warning").length +
      linkMatches.filter((entry) => entry.severity === "warning").length;
    rows.push([categoryLabel(category, t), error, warning, error + warning]);
  }
  return {
    sheet: "분류별 현황",
    data: rows,
    columns: [22, 14, 14, 14].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

function buildTopIssuesSheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const aggregate = new Map<
    string,
    { ruleId: string; category: string; issue: string; count: number }
  >();
  for (const entry of actionableRuleEntries(snapshot)) {
    const issueText = t(entry.issue.message, entry.issue.messageVars);
    const key = `${entry.issue.ruleId}:${issueText}`;
    const current = aggregate.get(key) ?? {
      ruleId: entry.issue.ruleId,
      category: categoryLabel(entry.issue.category, t),
      issue: issueText,
      count: 0,
    };
    current.count += entry.issue.count ?? 1;
    aggregate.set(key, current);
  }
  const top = [...aggregate.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const rows: SheetData = [
    header(["순위", "규칙 ID", "분류", "주요 이슈", "발생 수"]),
  ];
  top.forEach((entry, index) =>
    rows.push([
      index + 1,
      entry.ruleId,
      entry.category,
      entry.issue,
      entry.count,
    ]),
  );
  return {
    sheet: "주요 이슈 TOP 10",
    data: rows,
    columns: [10, 18, 14, 68, 12].map((width) => ({ width })),
    stickyRowsCount: 1,
  };
}

function buildUrlRiskSheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const risk = new Map<string, { errors: number; warnings: number }>();
  for (const entry of actionableRuleEntries(snapshot)) {
    const current = risk.get(entry.pageUrl) ?? { errors: 0, warnings: 0 };
    if (entry.issue.severity === "error")
      current.errors += entry.issue.count ?? 1;
    else current.warnings += entry.issue.count ?? 1;
    risk.set(entry.pageUrl, current);
  }
  for (const entry of actionableLinkEntries(snapshot)) {
    const current = risk.get(entry.targetUrl) ?? { errors: 0, warnings: 0 };
    if (entry.severity === "error") current.errors += 1;
    else current.warnings += 1;
    risk.set(entry.targetUrl, current);
  }
  const ranked = [...risk.entries()]
    .map(([url, value]) => ({
      url,
      ...value,
      score: value.errors * 3 + value.warnings,
    }))
    .sort((a, b) => b.score - a.score);
  const rows: SheetData = [
    header(["순위", "대상 URL", "오류", "경고", "위험 점수", "판정"]),
  ];
  ranked.forEach((entry, index) =>
    rows.push([
      index + 1,
      entry.url,
      entry.errors,
      entry.warnings,
      entry.score,
      entry.score >= 6
        ? t("report.risk.high")
        : entry.score >= 2
          ? t("report.risk.medium")
          : t("report.risk.low"),
    ]),
  );
  return {
    sheet: "URL 위험 순위",
    data: rows,
    columns: [10, 64, 10, 10, 12, 12].map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 2,
  };
}

function buildEvidenceSheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const rows: SheetData = [
    header([
      "대상 URL",
      "분류",
      "규칙 ID",
      "심각도",
      "상세 근거",
      "요소/코드",
      "발생 수",
    ]),
  ];
  for (const entry of snapshot.ruleIssues) {
    if (isValid(entry)) continue;
    rows.push([
      entry.pageUrl,
      categoryLabel(entry.issue.category, t),
      entry.issue.ruleId,
      isUnavailable(entry)
        ? statusLabel("unavailable", t)
        : severityLabel(entry.issue.severity, t),
      t(entry.issue.message, entry.issue.messageVars),
      safeText(entry.issue.element),
      entry.issue.count ?? 1,
    ]);
  }
  return {
    sheet: "상세 근거",
    data: rows,
    columns: [58, 14, 18, 14, 68, 48, 10].map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
    orientation: "landscape",
  };
}

export function buildManagerWorkbook(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet[] {
  return [
    buildManagementSummarySheet(snapshot, t),
    {
      sheet: "호환성 점검",
      data: compatibilityRows(snapshot, t),
      columns: [24, 34, 14, 72].map((width) => ({ width })),
      stickyRowsCount: 1,
      orientation: "landscape",
    },
    buildCategorySheet(snapshot, t),
    buildTopIssuesSheet(snapshot, t),
    buildUrlRiskSheet(snapshot, t),
    buildEvidenceSheet(snapshot, t),
  ];
}

export function reportFileName(kind: ReportKind, now = new Date()): string {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `optiweb-${kind === "developer" ? "developer" : "management"}-${date}.xlsx`;
}

export async function downloadWorkbook(
  kind: ReportKind,
  snapshot: ReportSnapshot,
  t: Translate,
): Promise<void> {
  const sheets =
    kind === "developer"
      ? buildDeveloperWorkbook(snapshot, t)
      : buildManagerWorkbook(snapshot, t);
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile(sheets, {
    fontFamily: "Pretendard",
    fontSize: 10,
  }).toFile(reportFileName(kind));
}
