import type { Rule } from "../types";

export const a10ViewportRule: Rule = {
  id: "A10",
  category: "a11y",
  severity: "error",
  wcag: "1.4.4",
  kwcag: "5.4.4",
  check(ctx) {
    const content =
      ctx.doc
        .querySelector('meta[name="viewport" i]')
        ?.getAttribute("content") ?? "";
    if (!content) return [];
    const userScalableNo = /user-scalable\s*=\s*no/i.test(content);
    const maxScaleMatch = /maximum-scale\s*=\s*([\d.]+)/i.exec(content);
    const maxScaleTooSmall = maxScaleMatch?.[1]
      ? Number(maxScaleMatch[1]) < 2
      : false;
    if (!userScalableNo && !maxScaleTooSmall) return [];
    return [
      {
        ruleId: "A10",
        category: "a11y",
        severity: "error",
        message: "rules.A10.message",
        wcag: "1.4.4",
        kwcag: "5.4.4",
        messageVars: { content },
      },
    ];
  },
};
