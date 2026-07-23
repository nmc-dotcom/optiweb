import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

/** A link whose only content is this img, with no other text/alt to give it an accessible name. */
function isOnlyContentOfLink(img: Element): boolean {
  const link = img.closest("a");
  if (!link) return false;
  if ((link.textContent ?? "").trim().length > 0) return false;
  const otherImagesHaveAlt = Array.from(link.querySelectorAll("img"))
    .filter((el) => el !== img)
    .some((el) => (el.getAttribute("alt") ?? "").trim().length > 0);
  return !otherImagesHaveAlt;
}

export const a1AltRule: Rule = {
  id: "A1",
  category: "a11y",
  severity: "error",
  wcag: "1.1.1",
  kwcag: "5.1.1",
  check(ctx) {
    const issues: Issue[] = [];
    for (const img of Array.from(ctx.doc.querySelectorAll("img"))) {
      if (!img.hasAttribute("alt")) {
        issues.push({
          ruleId: "A1",
          category: "a11y",
          severity: "error",
          message: "rules.A1.message.missing",
          wcag: "1.1.1",
          kwcag: "5.1.1",
          element: elementSnippet(img),
        });
        continue;
      }
      const alt = img.getAttribute("alt") ?? "";
      if (alt.trim() === "" && isOnlyContentOfLink(img)) {
        issues.push({
          ruleId: "A1",
          category: "a11y",
          severity: "error",
          message: "rules.A1.message.emptyInLink",
          wcag: "1.1.1",
          kwcag: "5.1.1",
          element: elementSnippet(img),
        });
      }
    }
    return collapseIssues(issues);
  },
};
