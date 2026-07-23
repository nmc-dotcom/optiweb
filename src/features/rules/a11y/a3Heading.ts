import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

export const a3HeadingRule: Rule = {
  id: "A3",
  category: "a11y",
  severity: "warning",
  wcag: "1.3.1",
  kwcag: "5.3.1",
  check(ctx) {
    const issues: Issue[] = [];
    const headings = Array.from(ctx.doc.querySelectorAll("h1,h2,h3,h4,h5,h6"));

    if (ctx.doc.querySelectorAll("h1").length === 0) {
      issues.push({
        ruleId: "A3",
        category: "a11y",
        severity: "warning",
        message: "rules.A3.message.noH1",
        wcag: "1.3.1",
        kwcag: "5.3.1",
      });
    }

    let previousLevel = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      if ((heading.textContent ?? "").trim().length === 0) {
        issues.push({
          ruleId: "A3",
          category: "a11y",
          severity: "warning",
          message: "rules.A3.message.empty",
          wcag: "1.3.1",
          kwcag: "5.3.1",
          element: elementSnippet(heading),
        });
      }
      if (previousLevel > 0 && level > previousLevel + 1) {
        issues.push({
          ruleId: "A3",
          category: "a11y",
          severity: "warning",
          message: "rules.A3.message.skip",
          wcag: "1.3.1",
          kwcag: "5.3.1",
          messageVars: { from: previousLevel, to: level },
          element: elementSnippet(heading),
        });
      }
      previousLevel = level;
    }

    return collapseIssues(issues);
  },
};
