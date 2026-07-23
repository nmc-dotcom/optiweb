import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const DEPRECATED_ELEMENTS = [
  "font",
  "center",
  "marquee",
  "big",
  "frame",
  "frameset",
  "applet",
  "blink",
];

export const s4DeprecatedElementsRule: Rule = {
  id: "S4",
  category: "standards",
  severity: "warning",
  check(ctx) {
    const issues: Issue[] = [];
    for (const tag of DEPRECATED_ELEMENTS) {
      for (const el of Array.from(ctx.doc.querySelectorAll(tag))) {
        issues.push({
          ruleId: "S4",
          category: "standards",
          severity: "warning",
          message: "rules.S4.message",
          messageVars: { tag },
          element: elementSnippet(el),
        });
      }
    }
    return collapseIssues(issues);
  },
};
