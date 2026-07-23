import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

export const a13AutoMotionRule: Rule = {
  id: "A13",
  category: "a11y",
  severity: "warning",
  wcag: "2.2.2",
  kwcag: "6.3.1",
  check(ctx) {
    const issues: Issue[] = [];
    for (const el of Array.from(ctx.doc.querySelectorAll("marquee, blink"))) {
      issues.push({
        ruleId: "A13",
        category: "a11y",
        severity: "warning",
        message: "rules.A13.message.marqueeBlink",
        wcag: "2.2.2",
        kwcag: "6.3.1",
        element: elementSnippet(el),
      });
    }
    for (const el of Array.from(
      ctx.doc.querySelectorAll("audio[autoplay], video[autoplay]"),
    )) {
      issues.push({
        ruleId: "A13",
        category: "a11y",
        severity: "warning",
        message: "rules.A13.message.autoplay",
        wcag: "2.2.2",
        kwcag: "6.3.1",
        element: elementSnippet(el),
      });
    }
    return collapseIssues(issues);
  },
};
