import type { Rule } from "../types";

// S1 must read raw HTML — DOMParser silently normalizes/injects a doctype, so ctx.doc
// can never show it missing even when the source document has none.
const DOCTYPE_PATTERN = /<!doctype\s+([^>]*)>/i;

export const s1DoctypeRule: Rule = {
  id: "S1",
  category: "standards",
  severity: "warning",
  check(ctx) {
    const match = DOCTYPE_PATTERN.exec(ctx.html);
    if (!match) {
      return [
        {
          ruleId: "S1",
          category: "standards",
          severity: "warning",
          message: "rules.S1.message.missing",
        },
      ];
    }
    const declaration = (match[1] ?? "").trim().toLowerCase();
    if (declaration !== "html") {
      return [
        {
          ruleId: "S1",
          category: "standards",
          severity: "warning",
          message: "rules.S1.message.legacy",
          messageVars: { doctype: match[0].trim() },
        },
      ];
    }
    return [];
  },
};
