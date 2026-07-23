import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

export const a7IframeTitleRule: Rule = {
  id: "A7",
  category: "a11y",
  severity: "error",
  wcag: "4.1.2",
  kwcag: "8.2.1",
  check(ctx) {
    const issues: Issue[] = [];
    for (const iframe of Array.from(ctx.doc.querySelectorAll("iframe"))) {
      if (!iframe.getAttribute("title")?.trim()) {
        issues.push({
          ruleId: "A7",
          category: "a11y",
          severity: "error",
          message: "rules.A7.message",
          wcag: "4.1.2",
          kwcag: "8.2.1",
          element: elementSnippet(iframe),
        });
      }
    }
    return collapseIssues(issues);
  },
};
