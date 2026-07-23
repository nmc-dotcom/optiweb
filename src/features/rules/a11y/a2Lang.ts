import type { Rule } from "../types";

const BCP47_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export const a2LangRule: Rule = {
  id: "A2",
  category: "a11y",
  severity: "error",
  wcag: "3.1.1",
  kwcag: "7.1.1",
  check(ctx) {
    const lang = ctx.doc.documentElement.getAttribute("lang")?.trim();
    if (lang && BCP47_PATTERN.test(lang)) return [];
    return [
      {
        ruleId: "A2",
        category: "a11y",
        severity: "error",
        message: "rules.A2.message",
        wcag: "3.1.1",
        kwcag: "7.1.1",
        messageVars: { lang: lang ?? "" },
      },
    ];
  },
};
