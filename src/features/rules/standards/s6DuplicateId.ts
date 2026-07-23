import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";
import { findDuplicateIds } from "../shared/duplicateIds";

/** Same detection as A9 (../a11y/a9DuplicateId.ts) — shared helper, counted under both categories. */
export const s6DuplicateIdRule: Rule = {
  id: "S6",
  category: "standards",
  severity: "info",
  check(ctx) {
    const issues: Issue[] = findDuplicateIds(ctx.doc).map((group) => ({
      ruleId: "S6",
      category: "standards",
      severity: "info",
      message: "rules.S6.message",
      messageVars: { id: group.id, count: group.elements.length },
      element: elementSnippet(group.elements[0]),
    }));
    return collapseIssues(issues);
  },
};
