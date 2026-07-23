import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

function hasAccessibleName(el: Element): boolean {
  if ((el.textContent ?? "").trim().length > 0) return true;
  if (el.getAttribute("aria-label")?.trim()) return true;
  if (el.getAttribute("title")?.trim()) return true;
  const hasAltImage = Array.from(el.querySelectorAll("img")).some(
    (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
  );
  return hasAltImage;
}

export const a5AccessibleNameRule: Rule = {
  id: "A5",
  category: "a11y",
  severity: "error",
  wcag: "2.4.4",
  kwcag: "6.4.2",
  check(ctx) {
    const issues: Issue[] = [];
    for (const el of Array.from(ctx.doc.querySelectorAll("a[href], button"))) {
      if (!hasAccessibleName(el)) {
        issues.push({
          ruleId: "A5",
          category: "a11y",
          severity: "error",
          message: "rules.A5.message",
          wcag: "2.4.4",
          kwcag: "6.4.2",
          element: elementSnippet(el),
        });
      }
    }
    return collapseIssues(issues);
  },
};
