import type { Rule } from "../types";

export const s3ViewportRule: Rule = {
  id: "S3",
  category: "standards",
  severity: "warning",
  check(ctx) {
    if (ctx.doc.querySelector('meta[name="viewport" i]')) return [];
    return [
      {
        ruleId: "S3",
        category: "standards",
        severity: "warning",
        message: "rules.S3.message",
      },
    ];
  },
};
