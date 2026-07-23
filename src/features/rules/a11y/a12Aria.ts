import {
  collapseIssues,
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

// WAI-ARIA 1.2 role list (abstract roles excluded — those are only valid as base types, not usable in markup).
const VALID_ROLES = new Set([
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "button",
  "cell",
  "checkbox",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "dialog",
  "directory",
  "document",
  "feed",
  "figure",
  "form",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
]);

const VALID_ARIA_ATTRIBUTES = new Set([
  "aria-activedescendant",
  "aria-atomic",
  "aria-autocomplete",
  "aria-busy",
  "aria-checked",
  "aria-colcount",
  "aria-colindex",
  "aria-colspan",
  "aria-controls",
  "aria-current",
  "aria-describedby",
  "aria-details",
  "aria-disabled",
  "aria-dropeffect",
  "aria-errormessage",
  "aria-expanded",
  "aria-flowto",
  "aria-grabbed",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-keyshortcuts",
  "aria-label",
  "aria-labelledby",
  "aria-level",
  "aria-live",
  "aria-modal",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-owns",
  "aria-placeholder",
  "aria-posinset",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-roledescription",
  "aria-rowcount",
  "aria-rowindex",
  "aria-rowspan",
  "aria-selected",
  "aria-setsize",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
]);

export const a12AriaRule: Rule = {
  id: "A12",
  category: "a11y",
  severity: "warning",
  wcag: "4.1.2",
  kwcag: "8.2.2",
  check(ctx) {
    const issues: Issue[] = [];

    for (const el of Array.from(ctx.doc.querySelectorAll("[role]"))) {
      const role = el.getAttribute("role")?.trim().toLowerCase();
      if (role && !VALID_ROLES.has(role)) {
        issues.push({
          ruleId: "A12",
          category: "a11y",
          severity: "warning",
          message: "rules.A12.message.role",
          wcag: "4.1.2",
          kwcag: "8.2.2",
          messageVars: { role },
          element: elementSnippet(el),
        });
      }
    }

    for (const el of Array.from(ctx.doc.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        if (
          attr.name.startsWith("aria-") &&
          !VALID_ARIA_ATTRIBUTES.has(attr.name.toLowerCase())
        ) {
          issues.push({
            ruleId: "A12",
            category: "a11y",
            severity: "warning",
            message: "rules.A12.message.attr",
            wcag: "4.1.2",
            kwcag: "8.2.2",
            messageVars: { attr: attr.name },
            element: elementSnippet(el),
          });
        }
      }
    }

    return collapseIssues(issues);
  },
};
