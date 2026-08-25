import type { Issue, Rule } from "../types";
import { analyzeCssCompatibility } from "./cssCompatibility";

export const s12InlineCssRule: Rule = {
  id: "S12",
  category: "standards",
  severity: "warning",
  check(ctx) {
    const issues: Issue[] = [];
    for (const style of Array.from(ctx.doc.querySelectorAll("style"))) {
      issues.push(...analyzeCssCompatibility(style.textContent ?? ""));
    }
    for (const element of Array.from(ctx.doc.querySelectorAll("[style]"))) {
      issues.push(...analyzeCssCompatibility(element.getAttribute("style") ?? ""));
    }
    return issues;
  },
};
