import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const DEPRECATED_ATTRIBUTE_SELECTORS: { attr: string; selector: string }[] = [
  { attr: "align", selector: "[align]" },
  { attr: "bgcolor", selector: "[bgcolor]" },
  { attr: "cellpadding", selector: "[cellpadding]" },
  { attr: "cellspacing", selector: "[cellspacing]" },
  { attr: "border", selector: "img[border]" },
];

export const s5DeprecatedAttributesRule: Rule = {
  id: "S5",
  category: "standards",
  severity: "info",
  check(ctx) {
    const issues: Issue[] = [];
    for (const { attr, selector } of DEPRECATED_ATTRIBUTE_SELECTORS) {
      for (const el of Array.from(ctx.doc.querySelectorAll(selector))) {
        issues.push({
          ruleId: "S5",
          category: "standards",
          severity: "info",
          message: "rules.S5.message",
          messageVars: { attr },
          element: elementSnippet(el),
        });
      }
    }
    return collapseIssues(issues);
  },
};
