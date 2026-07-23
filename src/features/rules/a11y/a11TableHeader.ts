import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

export const a11TableHeaderRule: Rule = {
  id: "A11",
  category: "a11y",
  severity: "warning",
  wcag: "1.3.1",
  kwcag: "5.3.1",
  check(ctx) {
    const issues: Issue[] = [];
    for (const table of Array.from(ctx.doc.querySelectorAll("table"))) {
      const dataRowCount = Array.from(table.querySelectorAll("tr")).filter(
        (tr) => tr.querySelector("td"),
      ).length;
      if (dataRowCount >= 2 && !table.querySelector("th")) {
        issues.push({
          ruleId: "A11",
          category: "a11y",
          severity: "warning",
          message: "rules.A11.message",
          wcag: "1.3.1",
          kwcag: "5.3.1",
          element: elementSnippet(table),
        });
      }
    }
    return collapseIssues(issues);
  },
};
