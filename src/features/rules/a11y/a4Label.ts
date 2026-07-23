import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const EXCLUDED_INPUT_TYPES = new Set([
  "hidden",
  "submit",
  "button",
  "reset",
  "image",
]);

function hasAccessibleLabel(doc: Document, field: Element): boolean {
  const id = field.getAttribute("id");
  if (id && doc.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;
  if (field.getAttribute("aria-label")?.trim()) return true;
  if (field.getAttribute("aria-labelledby")?.trim()) return true;
  if (field.closest("label")) return true;
  return false;
}

export const a4LabelRule: Rule = {
  id: "A4",
  category: "a11y",
  severity: "error",
  wcag: "3.3.2",
  kwcag: "7.3.2",
  check(ctx) {
    const issues: Issue[] = [];
    for (const field of Array.from(
      ctx.doc.querySelectorAll("input, select, textarea"),
    )) {
      const type = field.getAttribute("type")?.toLowerCase();
      if (field.tagName === "INPUT" && type && EXCLUDED_INPUT_TYPES.has(type))
        continue;
      if (!hasAccessibleLabel(ctx.doc, field)) {
        issues.push({
          ruleId: "A4",
          category: "a11y",
          severity: "error",
          message: "rules.A4.message",
          wcag: "3.3.2",
          kwcag: "7.3.2",
          element: elementSnippet(field),
        });
      }
    }
    return collapseIssues(issues);
  },
};
