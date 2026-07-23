import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const RESOURCE_SELECTORS = [
  "img[src]",
  "script[src]",
  "link[href]",
  "iframe[src]",
];

export const s9MixedContentRule: Rule = {
  id: "S9",
  category: "standards",
  severity: "error",
  check(ctx) {
    if (!ctx.url.startsWith("https://")) return [];
    const issues: Issue[] = [];
    for (const selector of RESOURCE_SELECTORS) {
      for (const el of Array.from(ctx.doc.querySelectorAll(selector))) {
        const attr = el.hasAttribute("src") ? "src" : "href";
        const value = (el.getAttribute(attr) ?? "").trim();
        if (value.toLowerCase().startsWith("http://")) {
          issues.push({
            ruleId: "S9",
            category: "standards",
            severity: "error",
            message: "rules.S9.message",
            messageVars: { url: value },
            element: elementSnippet(el),
          });
        }
      }
    }
    return collapseIssues(issues);
  },
};
