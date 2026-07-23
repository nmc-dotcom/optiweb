import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const BCP47_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export const s8HreflangRule: Rule = {
  id: "S8",
  category: "standards",
  severity: "warning",
  check(ctx) {
    const issues: Issue[] = [];

    const lang = ctx.doc.documentElement.getAttribute("lang")?.trim();
    if (lang && !BCP47_PATTERN.test(lang)) {
      issues.push({
        ruleId: "S8",
        category: "standards",
        severity: "warning",
        message: "rules.S8.message.lang",
        messageVars: { lang },
      });
    }

    for (const el of Array.from(ctx.doc.querySelectorAll("[hreflang]"))) {
      const hreflang = el.getAttribute("hreflang")?.trim();
      if (
        hreflang &&
        hreflang.toLowerCase() !== "x-default" &&
        !BCP47_PATTERN.test(hreflang)
      ) {
        issues.push({
          ruleId: "S8",
          category: "standards",
          severity: "warning",
          message: "rules.S8.message.hreflang",
          messageVars: { hreflang },
          element: elementSnippet(el),
        });
      }
    }

    return collapseIssues(issues);
  },
};
