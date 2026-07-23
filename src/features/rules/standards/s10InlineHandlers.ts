import type { Rule } from "../types";

const MAX_HANDLERS = 20;

export const s10InlineHandlersRule: Rule = {
  id: "S10",
  category: "standards",
  severity: "info",
  check(ctx) {
    let count = 0;
    for (const el of Array.from(ctx.doc.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.toLowerCase().startsWith("on")) count += 1;
      }
    }
    if (count <= MAX_HANDLERS) return [];
    return [
      {
        ruleId: "S10",
        category: "standards",
        severity: "info",
        message: "rules.S10.message",
        messageVars: { count },
      },
    ];
  },
};
