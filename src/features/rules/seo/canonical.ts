import type { Rule } from "../types";

export const canonicalRule: Rule = {
  id: "SEO-CANONICAL",
  category: "seo",
  severity: "info",
  check(ctx) {
    if (ctx.doc.querySelector('link[rel="canonical"]')) return [];
    return [
      {
        ruleId: "SEO-CANONICAL",
        category: "seo",
        severity: "info",
        message: "rules.SEO-CANONICAL.message",
      },
    ];
  },
};
