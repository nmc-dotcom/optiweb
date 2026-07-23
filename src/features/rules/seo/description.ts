import type { Rule } from "../types";
import { getMetaDescription } from "./shared";

export const descriptionRule: Rule = {
  id: "SEO-DESC",
  category: "seo",
  severity: "warning",
  check(ctx) {
    if (getMetaDescription(ctx.doc)) return [];
    return [
      {
        ruleId: "SEO-DESC",
        category: "seo",
        severity: "warning",
        message: "rules.SEO-DESC.message",
      },
    ];
  },
};
