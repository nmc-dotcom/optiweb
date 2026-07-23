import type { Rule } from "../types";
import { getTitleText } from "./shared";

export const titleRule: Rule = {
  id: "SEO-TITLE",
  category: "seo",
  severity: "error",
  check(ctx) {
    if (getTitleText(ctx.doc)) return [];
    return [
      {
        ruleId: "SEO-TITLE",
        category: "seo",
        severity: "error",
        message: "rules.SEO-TITLE.message",
      },
    ];
  },
};
