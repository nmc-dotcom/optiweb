import type { Rule } from "../types";

function containsNoindex(value: string | null | undefined): boolean {
  return !!value && /noindex/i.test(value);
}

export const noindexRule: Rule = {
  id: "SEO-NOINDEX",
  category: "seo",
  severity: "warning",
  check(ctx) {
    const metaRobots = ctx.doc
      .querySelector('meta[name="robots" i]')
      ?.getAttribute("content");
    const xRobotsTag = ctx.headers["x-robots-tag"];
    if (!containsNoindex(metaRobots) && !containsNoindex(xRobotsTag)) return [];
    return [
      {
        ruleId: "SEO-NOINDEX",
        category: "seo",
        severity: "warning",
        message: "rules.SEO-NOINDEX.message",
      },
    ];
  },
};
