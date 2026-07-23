import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const GENERIC_TEXTS = new Set([
  "여기",
  "클릭",
  "더보기",
  "바로가기",
  "here",
  "click",
  "more",
]);

export const a6GenericLinkTextRule: Rule = {
  id: "A6",
  category: "a11y",
  severity: "warning",
  wcag: "2.4.4",
  kwcag: "6.4.2",
  check(ctx) {
    const issues: Issue[] = [];
    for (const a of Array.from(ctx.doc.querySelectorAll("a[href]"))) {
      const text = (a.textContent ?? "").trim();
      if (GENERIC_TEXTS.has(text.toLowerCase())) {
        issues.push({
          ruleId: "A6",
          category: "a11y",
          severity: "warning",
          message: "rules.A6.message",
          wcag: "2.4.4",
          kwcag: "6.4.2",
          messageVars: { text },
          element: elementSnippet(a),
        });
      }
    }
    return collapseIssues(issues);
  },
};
