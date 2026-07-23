import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const SAME_TAG_NESTING_CANDIDATES = ["a", "button"] as const;

/**
 * The HTML parser's "adoption agency" behavior implicitly closes an open `<a>`/`<button>`
 * when another one of the same tag starts, so `<a>outer<a>inner</a></a>` never actually
 * appears nested in the parsed Document — same class of problem as S1/S2's DOCTYPE/charset,
 * so this specific case has to be checked against the raw HTML instead of ctx.doc.
 */
function hasSameTagNesting(html: string, tag: string): boolean {
  const tokenPattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(html))) {
    if (match[1] === "/") {
      if (depth > 0) depth -= 1;
    } else {
      if (depth > 0) return true;
      depth += 1;
    }
  }
  return false;
}

export const s7InvalidNestingRule: Rule = {
  id: "S7",
  category: "standards",
  severity: "error",
  check(ctx) {
    const issues: Issue[] = [];

    for (const tag of SAME_TAG_NESTING_CANDIDATES) {
      if (hasSameTagNesting(ctx.html, tag)) {
        issues.push({
          ruleId: "S7",
          category: "standards",
          severity: "error",
          message: "rules.S7.message",
          messageVars: { outer: tag, inner: tag },
        });
      }
    }

    // Cross-type nesting (a-in-button, input-in-a, input-in-button, button-in-a) survives
    // parsing intact — same-tag nesting is already covered above via the raw HTML.
    for (const container of Array.from(ctx.doc.querySelectorAll("a, button"))) {
      const nested = Array.from(
        container.querySelectorAll("a, button, input"),
      ).find((el) => el.tagName !== container.tagName);
      if (nested) {
        issues.push({
          ruleId: "S7",
          category: "standards",
          severity: "error",
          message: "rules.S7.message",
          messageVars: {
            outer: container.tagName.toLowerCase(),
            inner: nested.tagName.toLowerCase(),
          },
          element: elementSnippet(container),
        });
      }
    }

    return collapseIssues(issues);
  },
};
