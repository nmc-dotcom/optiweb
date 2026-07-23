import type { Rule } from "../types";

const OG_PROPERTIES = ["og:title", "og:description", "og:image"] as const;

export const openGraphRule: Rule = {
  id: "SEO-OG",
  category: "seo",
  severity: "info",
  check(ctx) {
    const missing = OG_PROPERTIES.filter(
      (prop) => !ctx.doc.querySelector(`meta[property="${prop}"]`),
    );
    if (missing.length === 0) return [];
    return [
      {
        ruleId: "SEO-OG",
        category: "seo",
        severity: "info",
        message: "rules.SEO-OG.message",
        messageVars: { missing: missing.join(", ") },
      },
    ];
  },
};
