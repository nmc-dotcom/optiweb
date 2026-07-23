import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const NEW_WINDOW_HINTS = ["새 창", "new window"];

export const a14NewWindowRule: Rule = {
  id: "A14",
  category: "a11y",
  severity: "info",
  kwcag: "6.4.1",
  check(ctx) {
    const issues: Issue[] = [];
    for (const a of Array.from(
      ctx.doc.querySelectorAll('a[target="_blank"]'),
    )) {
      const haystack = [
        a.textContent,
        a.getAttribute("title"),
        a.getAttribute("aria-label"),
      ]
        .filter((v): v is string => !!v)
        .join(" ")
        .toLowerCase();
      const hasHint = NEW_WINDOW_HINTS.some((hint) => haystack.includes(hint));
      if (!hasHint) {
        issues.push({
          ruleId: "A14",
          category: "a11y",
          severity: "info",
          message: "rules.A14.message",
          kwcag: "6.4.1",
          element: elementSnippet(a),
        });
      }
    }
    return collapseIssues(issues);
  },
};
