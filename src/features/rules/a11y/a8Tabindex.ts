import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

export const a8TabindexRule: Rule = {
  id: "A8",
  category: "a11y",
  severity: "warning",
  wcag: "2.4.3",
  kwcag: "6.1.2",
  check(ctx) {
    const issues: Issue[] = [];
    for (const el of Array.from(ctx.doc.querySelectorAll("[tabindex]"))) {
      const value = Number(el.getAttribute("tabindex"));
      if (Number.isFinite(value) && value > 0) {
        issues.push({
          ruleId: "A8",
          category: "a11y",
          severity: "warning",
          message: "rules.A8.message",
          wcag: "2.4.3",
          kwcag: "6.1.2",
          messageVars: { value },
          element: elementSnippet(el),
        });
      }
    }
    return collapseIssues(issues);
  },
};
