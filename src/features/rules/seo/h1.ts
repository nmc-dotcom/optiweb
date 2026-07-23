import type { Rule } from "../types";

export const h1Rule: Rule = {
  id: "SEO-H1",
  category: "seo",
  severity: "warning",
  check(ctx) {
    if (ctx.doc.querySelectorAll("h1").length > 0) return [];
    return [
      {
        ruleId: "SEO-H1",
        category: "seo",
        severity: "warning",
        message: "rules.SEO-H1.message",
      },
    ];
  },
};
