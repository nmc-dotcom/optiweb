import { elementSnippet, type Rule } from "../types";

export const h1MultiRule: Rule = {
  id: "SEO-H1-MULTI",
  category: "seo",
  severity: "warning",
  check(ctx) {
    const h1s = ctx.doc.querySelectorAll("h1");
    if (h1s.length < 2) return [];
    return [
      {
        ruleId: "SEO-H1-MULTI",
        category: "seo",
        severity: "warning",
        message: "rules.SEO-H1-MULTI.message",
        messageVars: { count: h1s.length },
        element: elementSnippet(h1s[1]),
      },
    ];
  },
};
