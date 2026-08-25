import type { Cell, SheetData } from "write-excel-file/browser";
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
  zoomScale?: number;
  dateFormat?: string;
}

const PALETTE = {
  navy: "#173F35",
  green: "#2F6B4F",
  mint: "#E1EFE7",
  cream: "#F7F3E8",
  sand: "#ECE4D2",
  amber: "#FCE8B2",
  red: "#F8DEDA",
  redText: "#9F2D20",
  blue: "#DDEBF7",
  gray: "#EEF1EF",
  line: "#CBD5D0",
  white: "#FFFFFF",
  text: "#20352E",
} as const;

const HEADER = {
  fontWeight: "bold" as const,
  backgroundColor: PALETTE.green,
  textColor: PALETTE.white,
  align: "center" as const,
  alignVertical: "center" as const,
  wrap: true,
  height: 30,
  borderColor: PALETTE.navy,
  borderStyle: "thin" as const,
};

const SECTION = {
  fontWeight: "bold" as const,
  backgroundColor: PALETTE.sand,
  textColor: PALETTE.navy,
  height: 26,
  alignVertical: "center" as const,
};

const BODY_CELL = {
  alignVertical: "top" as const,
  wrap: true,
  borderColor: PALETTE.line,
  borderStyle: "thin" as const,
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

function styledCell(value: Cell, style: Record<string, unknown>): Cell {
  if (value === null || value === undefined) return value;
  if (
    typeof value === "object" &&
    !(value instanceof Date) &&
    "value" in value
  ) {
    return { ...style, ...value } as Cell;
  }
  return { value, ...style } as Cell;
}

function polishTable(data: SheetData, headerRows = 1): SheetData {
  return data.map((row, rowIndex) =>
    row.map((value) =>
      styledCell(
        value,
        rowIndex < headerRows
          ? HEADER
          : {
              ...BODY_CELL,
              backgroundColor:
                (rowIndex - headerRows) % 2 === 0 ? PALETTE.white : "#F8FAF9",
            },
      ),
    ),
  );
}

function standardTableOptions(
  overrides: Partial<WorkbookSheet> = {},
): Pick<
  WorkbookSheet,
  | "stickyRowsCount"
  | "orientation"
  | "showGridLines"
  | "zoomScale"
  | "dateFormat"
> &
  Partial<WorkbookSheet> {
  return {
    stickyRowsCount: 1,
    orientation: "landscape",
    showGridLines: false,
    zoomScale: 90,
    dateFormat: "yyyy-mm-dd hh:mm",
    ...overrides,
  };
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

function browserIssueCount(snapshot: ReportSnapshot): number {
  return (snapshot.browserAuditResults ?? []).reduce(
    (count, result) => count + result.issues.length,
    0,
  );
}

function issueTotals(snapshot: ReportSnapshot): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const entry of actionableRuleEntries(snapshot)) {
    const count = entry.issue.count ?? 1;
    if (entry.issue.severity === "error") errors += count;
    else warnings += count;
  }
  for (const entry of actionableLinkEntries(snapshot)) {
    if (entry.severity === "error") errors += 1;
    else warnings += 1;
  }
  warnings += browserIssueCount(snapshot);
  return { errors, warnings };
}

function titleRow(title: string, columnSpan: number): SheetData[number] {
  return [
    {
      value: title,
      columnSpan,
      fontSize: 20,
      fontWeight: "bold",
      textColor: PALETTE.white,
      backgroundColor: PALETTE.navy,
      alignVertical: "center",
      height: 42,
    },
  ];
}

function kpiLabel(value: string, color: string = PALETTE.green): Cell {
  return {
    value,
    fontWeight: "bold",
    textColor: PALETTE.white,
    backgroundColor: color,
    align: "center",
    alignVertical: "center",
    height: 24,
    borderColor: PALETTE.white,
    borderStyle: "thin",
  };
}

function kpiValue(value: string | number, backgroundColor: string): Cell {
  return {
    value,
    fontSize: 18,
    fontWeight: "bold",
    textColor: PALETTE.navy,
    backgroundColor,
    align: "center",
    alignVertical: "center",
    height: 34,
    borderColor: PALETTE.white,
    borderStyle: "thin",
  };
}

function priorityCell(priority: "높음" | "보통"): Cell {
  return {
    value: priority,
    fontWeight: "bold",
    textColor: priority === "높음" ? PALETTE.redText : "#7A4E00",
    backgroundColor: priority === "높음" ? PALETTE.red : PALETTE.amber,
    align: "center",
  };
}

function pendingCell(): Cell {
  return {
    value: "미처리",
    fontWeight: "bold",
    backgroundColor: PALETTE.gray,
    align: "center",
  };
}

function buildDeveloperSummarySheet(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet {
  const totals = issueTotals(snapshot);
  const actionableCount =
    actionableRuleEntries(snapshot).length +
    actionableLinkEntries(snapshot).length +
    browserIssueCount(snapshot);
  const rows: SheetData = [
    titleRow("개발자 조치 보고서", 4),
    [
      {
        value: snapshot.config?.startUrl ?? "점검 대상 URL 없음",
        columnSpan: 4,
        textColor: PALETTE.green,
        fontWeight: "bold",
        backgroundColor: PALETTE.cream,
        height: 26,
      },
    ],
    [],
    [
      kpiLabel("점검 HTML 페이지"),
      kpiLabel("조치 항목"),
      kpiLabel("오류", "#A53A2A"),
      kpiLabel("경고", "#B7791F"),
    ],
    [
      kpiValue(checkedPageCount(snapshot), PALETTE.mint),
      kpiValue(actionableCount, PALETTE.blue),
      kpiValue(totals.errors, PALETTE.red),
      kpiValue(totals.warnings, PALETTE.amber),
    ],
    [],
    [{ value: "권장 작업 순서", ...SECTION, columnSpan: 4 }],
    [
      "1",
      {
        value: "수정 요청 목록에서 ‘높음’ 우선순위를 먼저 처리합니다.",
        columnSpan: 3,
      },
    ],
    [
      "2",
      {
        value: "담당자·조치 내용·완료 예정일을 입력해 작업표로 사용합니다.",
        columnSpan: 3,
      },
    ],
    [
      "3",
      {
        value: "수정 후 재점검 결과 열에 통과 여부와 확인일을 기록합니다.",
        columnSpan: 3,
      },
    ],
    [],
    [{ value: "판정 기준", ...SECTION, columnSpan: 4 }],
    ["높음", "오류·깨진 링크 등 즉시 조치", "보통", "경고·호환성 개선"],
    [
      "자동점검 범위",
      { value: t("report.safeScopeDetail"), columnSpan: 3, wrap: true },
    ],
  ];
  return {
    sheet: "개발자 요약",
    data: polishTable(rows, 0),
    columns: [18, 42, 18, 42].map((width) => ({ width })),
    showGridLines: false,
    zoomScale: 95,
    dateFormat: "yyyy-mm-dd hh:mm",
  };
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
      priorityCell(entry.severity === "error" ? "높음" : "보통"),
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
      pendingCell(),
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
      priorityCell(issue.severity === "error" ? "높음" : "보통"),
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
      pendingCell(),
      "",
      "",
      "",
      "",
    ]);
  }

  for (const result of snapshot.browserAuditResults ?? []) {
    for (const issue of result.issues) {
      rows.push([
        `BROWSER-${String(sequence++).padStart(4, "0")}`,
        priorityCell(issue.kind === "navigation-error" ? "높음" : "보통"),
        result.url,
        "",
        categoryLabel("standards", t),
        `BROWSER-${result.browser.toUpperCase()}`,
        safeText(issue.message),
        `${issue.kind} · ${issue.viewport ?? "전체 뷰포트"}`,
        1,
        "",
        "",
        result.durationMs,
        "",
        "",
        pendingCell(),
        "",
        "",
        "",
        "",
      ]);
    }
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
    data: polishTable(rows),
    columns: [
      12, 10, 42, 42, 12, 16, 48, 42, 10, 12, 12, 14, 12, 12, 12, 12, 32, 14,
      18,
    ].map((width) => ({ width })),
    ...standardTableOptions({ stickyColumnsCount: 3 }),
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
    data: polishTable(rows),
    columns: [55, 12, 14, 14, 10, 10, 12, 12, 22].map((width) => ({ width })),
    ...standardTableOptions({ stickyColumnsCount: 1 }),
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
    data: polishTable(rows),
    columns: [18, 14, 12, 64, 14, 14].map((width) => ({ width })),
    ...standardTableOptions(),
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
    data: polishTable(rows),
    columns: [52, 12, 18, 16, 20, 24, 22, 62, 16, 22].map((width) => ({
      width,
    })),
    ...standardTableOptions({ stickyColumnsCount: 2 }),
  };
}

export function buildDeveloperWorkbook(
  snapshot: ReportSnapshot,
  t: Translate,
): WorkbookSheet[] {
  return [
    buildDeveloperSummarySheet(snapshot, t),
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
  const totals = issueTotals(snapshot);
  const totalFindings = totals.errors + totals.warnings;
  const overallRisk =
    totals.errors > 0 || snapshot.summary.brokenLinks > 0
      ? t("report.risk.high")
      : totals.warnings > 0
        ? t("report.risk.medium")
        : t("report.risk.low");
  const riskColor =
    overallRisk === t("report.risk.high")
      ? PALETTE.red
      : overallRisk === t("report.risk.medium")
        ? PALETTE.amber
        : PALETTE.mint;
  const rows: SheetData = [
    titleRow(t("report.manager.title"), 4),
    [
      {
        value: snapshot.config?.startUrl ?? "점검 대상 URL 없음",
        columnSpan: 4,
        textColor: PALETTE.green,
        fontWeight: "bold",
        backgroundColor: PALETTE.cream,
        height: 26,
      },
    ],
    [],
    [
      kpiLabel("점검 HTML 페이지"),
      kpiLabel("전체 탐지 결과"),
      kpiLabel("오류", "#A53A2A"),
      kpiLabel("경고", "#B7791F"),
    ],
    [
      kpiValue(checkedPageCount(snapshot), PALETTE.mint),
      kpiValue(totalFindings, PALETTE.blue),
      kpiValue(totals.errors, PALETTE.red),
      kpiValue(totals.warnings, PALETTE.amber),
    ],
    [],
    [{ value: "종합 판정", ...SECTION, columnSpan: 4 }],
    [
      {
        value: overallRisk,
        columnSpan: 4,
        fontSize: 18,
        fontWeight: "bold",
        align: "center",
        backgroundColor: riskColor,
        height: 34,
      },
    ],
    [],
    [{ value: "점검 개요", ...SECTION, columnSpan: 4 }],
    ["기준 URL", snapshot.config?.startUrl ?? ""],
    ["점검 일시", new Date(startedAt)],
    ["점검 방식", t("report.safeScope")],
    ["조치 항목 수", actionable.length + failedLinks.length],
    ["깨진 링크", snapshot.summary.brokenLinks],
    ["깨진 이미지", snapshot.summary.brokenImages],
    ["리다이렉트", snapshot.summary.redirects],
    ["브라우저 탐지 결과", browserIssueCount(snapshot)],
    [{ value: "자동점검 범위", ...SECTION, columnSpan: 4 }],
    [{ value: t("report.safeScopeDetail"), columnSpan: 4, wrap: true }],
    [
      {
        value: t("report.uncheckedDisclaimer"),
        columnSpan: 4,
        wrap: true,
        fontStyle: "italic",
        textColor: PALETTE.redText,
      },
    ],
  ];
  return {
    sheet: "종합 요약",
    data: polishTable(rows, 0),
    columns: [26, 62, 18, 18].map((width) => ({ width })),
    showGridLines: false,
    zoomScale: 95,
    dateFormat: "yyyy-mm-dd hh:mm",
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
      ruleMatches
        .filter((entry) => entry.issue.severity === "error")
        .reduce((count, entry) => count + (entry.issue.count ?? 1), 0) +
      linkMatches.filter((entry) => entry.severity === "error").length;
    const warning =
      ruleMatches
        .filter((entry) => entry.issue.severity === "warning")
        .reduce((count, entry) => count + (entry.issue.count ?? 1), 0) +
      linkMatches.filter((entry) => entry.severity === "warning").length;
    rows.push([categoryLabel(category, t), error, warning, error + warning]);
  }
  return {
    sheet: "분류별 현황",
    data: polishTable(rows),
    columns: [22, 14, 14, 14].map((width) => ({ width })),
    ...standardTableOptions(),
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
    data: polishTable(rows),
    columns: [10, 18, 14, 68, 12].map((width) => ({ width })),
    ...standardTableOptions(),
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
  for (const result of snapshot.browserAuditResults ?? []) {
    if (result.issues.length === 0) continue;
    const current = risk.get(result.url) ?? { errors: 0, warnings: 0 };
    current.warnings += result.issues.length;
    risk.set(result.url, current);
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
    data: polishTable(rows),
    columns: [10, 64, 10, 10, 12, 12].map((width) => ({ width })),
    ...standardTableOptions({ stickyColumnsCount: 2 }),
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
  for (const result of snapshot.browserAuditResults ?? []) {
    for (const issue of result.issues) {
      rows.push([
        result.url,
        categoryLabel("standards", t),
        `BROWSER-${result.browser.toUpperCase()}`,
        severityLabel("warning", t),
        safeText(issue.message),
        issue.viewport ?? "전체 뷰포트",
        1,
      ]);
    }
  }
  return {
    sheet: "상세 근거",
    data: polishTable(rows),
    columns: [58, 14, 18, 14, 68, 48, 10].map((width) => ({ width })),
    ...standardTableOptions({ stickyColumnsCount: 1 }),
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
      data: polishTable(compatibilityRows(snapshot, t)),
      columns: [24, 34, 14, 72].map((width) => ({ width })),
      ...standardTableOptions(),
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
