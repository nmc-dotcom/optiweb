import type { Rule } from "../types";
import { getMetaDescription } from "./shared";

const MIN_LENGTH = 50;
const MAX_LENGTH = 160;

export const descriptionLengthRule: Rule = {
  id: "SEO-DESC-LEN",
  category: "seo",
  severity: "info",
  check(ctx) {
    const description = getMetaDescription(ctx.doc);
    if (!description) return [];
    if (description.length >= MIN_LENGTH && description.length <= MAX_LENGTH)
      return [];
    return [
      {
        ruleId: "SEO-DESC-LEN",
        category: "seo",
        severity: "info",
        message: "rules.SEO-DESC-LEN.message",
        messageVars: {
          length: description.length,
          min: MIN_LENGTH,
          max: MAX_LENGTH,
        },
      },
    ];
  },
};
