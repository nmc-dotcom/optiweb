import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";
import { findDuplicateIds } from "../shared/duplicateIds";

export const a9DuplicateIdRule: Rule = {
  id: "A9",
  category: "a11y",
  severity: "warning",
  wcag: "4.1.1",
  kwcag: "8.1.1",
  check(ctx) {
    const issues: Issue[] = findDuplicateIds(ctx.doc).map((group) => ({
      ruleId: "A9",
      category: "a11y",
      severity: "warning",
      message: "rules.A9.message",
      wcag: "4.1.1",
      kwcag: "8.1.1",
      messageVars: { id: group.id, count: group.elements.length },
      element: elementSnippet(group.elements[0]),
    }));
    return collapseIssues(issues);
  },
};
