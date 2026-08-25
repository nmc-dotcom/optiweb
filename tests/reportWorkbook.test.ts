import { describe, expect, it } from "vitest";
import {
  buildDeveloperWorkbook,
  buildManagerWorkbook,
  reportFileName,
  type ReportSnapshot,
} from "../src/lib/reportWorkbook";

const t = (key: string) => key;

function snapshot(): ReportSnapshot {
  return {
    config: null,
    pageResults: [
      {
        url: "https://example.com",
        depth: 0,
        status: 200,
        redirectChain: [],
        isRedirectLoop: false,
        responseTimeMs: 123,
        requiresAuth: false,
        blockedByRobots: false,
        discoveredAt: Date.UTC(2026, 7, 25),
      },
    ],
    linkResults: [],
    ruleIssues: [
      {
        pageUrl: "https://example.com",
        issue: {
          ruleId: "W3C-HTML",
          category: "standards",
          severity: "info",
          message: "rules.W3C.valid",
        },
      },
      {
        pageUrl: "https://example.com",
        issue: {
          ruleId: "S11",
          category: "standards",
          severity: "warning",
          message: "legacy technology",
        },
      },
    ],
    summary: {
      pagesScanned: 1,
      brokenLinks: 0,
      redirects: 0,
      brokenImages: 0,
      seoWarnings: 0,
      a11yIssues: 0,
      standardsIssues: 1,
    },
  };
}

describe("Excel report workbooks", () => {
  it("creates different sheet sets for developer and management reports", () => {
    expect(
      buildDeveloperWorkbook(snapshot(), t).map((sheet) => sheet.sheet),
    ).toEqual([
      "수정 요청 목록",
      "URL별 현황",
      "브라우저 호환성 상세",
      "규칙 설명",
    ]);
    expect(
      buildManagerWorkbook(snapshot(), t).map((sheet) => sheet.sheet),
    ).toEqual([
      "종합 요약",
      "호환성 점검",
      "분류별 현황",
      "주요 이슈 TOP 10",
      "URL 위험 순위",
      "상세 근거",
    ]);
  });

  it("marks real W3C validation and unconnected browsers truthfully", () => {
    const compatibility = buildManagerWorkbook(snapshot(), t).find(
      (sheet) => sheet.sheet === "호환성 점검",
    );
    const text = JSON.stringify(compatibility?.data);
    expect(text).toContain("report.status.pass");
    expect(text).toContain("report.status.not-run");
    expect(text).toContain("report.status.fail");
  });

  it("uses a stable dated xlsx filename", () => {
    expect(reportFileName("manager", new Date(2026, 7, 25))).toBe(
      "optiweb-management-20260825.xlsx",
    );
  });

  it("uses actual browser results in the management compatibility sheet", () => {
    const data = snapshot();
    data.browserAuditResults = [
      {
        url: "https://example.com",
        browser: "chrome",
        browserVersion: "140.0",
        functionalStatus: "pass",
        visualStatus: "fail",
        issues: [
          {
            kind: "horizontal-overflow",
            viewport: "mobile",
            message: "Document exceeds viewport by 12px",
          },
        ],
        viewports: [],
        durationMs: 100,
        checkedAt: Date.UTC(2026, 7, 25),
      },
    ];
    const compatibility = buildManagerWorkbook(data, t).find(
      (sheet) => sheet.sheet === "호환성 점검",
    );
    const text = JSON.stringify(compatibility?.data);
    expect(text).toContain("report.browser.completedEvidence");
    expect(text).toContain("report.status.fail");
  });

  it("serializes the management workbook as a real xlsx zip", async () => {
    const { default: writeExcelFile } = await import("write-excel-file/node");
    const buffer = await writeExcelFile(buildManagerWorkbook(snapshot(), t), {
      fontFamily: "Arial",
      fontSize: 10,
    }).toBuffer();
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1_000);
  });
});
