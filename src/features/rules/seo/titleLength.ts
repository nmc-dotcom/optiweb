import type { Rule } from "../types";
import { getTitleText } from "./shared";

const MIN_LENGTH = 10;
const MAX_LENGTH = 60;

export const titleLengthRule: Rule = {
  id: "SEO-TITLE-LEN",
  category: "seo",
  severity: "warning",
  check(ctx) {
    const title = getTitleText(ctx.doc);
    if (!title) return [];
    if (title.length >= MIN_LENGTH && title.length <= MAX_LENGTH) return [];
    return [
      {
        ruleId: "SEO-TITLE-LEN",
        category: "seo",
        severity: "warning",
        message: "rules.SEO-TITLE-LEN.message",
        messageVars: { length: title.length, min: MIN_LENGTH, max: MAX_LENGTH },
      },
    ];
  },
};
