import {
  elementSnippet,
  type Issue,
  type Rule,
} from "../types";

const LEGACY_PLUGIN_SELECTORS = [
  { technology: "Java Applet", selector: "applet" },
  {
    technology: "ActiveX/legacy object plug-in",
    selector:
      'object[classid], object[codebase], object[codetype], object[type*="shockwave" i], object[type*="java" i], object[data$=".swf" i]',
  },
  {
    technology: "Flash/Java embed plug-in",
    selector:
      'embed[type*="shockwave" i], embed[type*="java" i], embed[src$=".swf" i]',
  },
] as const;
const LEGACY_SCRIPT_TYPES = [
  "text/vbscript",
  "application/x-vbscript",
  "text/x-vbscript",
];

const LEGACY_SCRIPT_PATTERNS: Array<{ technology: string; pattern: RegExp }> = [
  { technology: "ActiveXObject", pattern: /\bActiveXObject\s*\(/i },
  { technology: "document.all", pattern: /\bdocument\.all\b/i },
  { technology: "attachEvent", pattern: /\.attachEvent\s*\(/i },
  { technology: "showModalDialog", pattern: /\bshowModalDialog\s*\(/i },
  { technology: "execScript", pattern: /\bexecScript\s*\(/i },
];

export const s11LegacyTechnologiesRule: Rule = {
  id: "S11",
  category: "standards",
  severity: "error",
  check(ctx) {
    const issues: Issue[] = [];

    for (const { technology, selector } of LEGACY_PLUGIN_SELECTORS) {
      for (const el of Array.from(ctx.doc.querySelectorAll(selector))) {
        issues.push({
          ruleId: "S11",
          category: "standards",
          severity: "error",
          message: "rules.S11.message.element",
          messageVars: { technology },
          element: elementSnippet(el),
        });
      }
    }

    for (const script of Array.from(ctx.doc.querySelectorAll("script"))) {
      const type = script.getAttribute("type")?.trim().toLowerCase();
      if (type && LEGACY_SCRIPT_TYPES.includes(type)) {
        issues.push({
          ruleId: "S11",
          category: "standards",
          severity: "error",
          message: "rules.S11.message.element",
          messageVars: { technology: type },
          element: elementSnippet(script),
        });
      }
    }

    const scriptSource = Array.from(ctx.doc.querySelectorAll("script"))
      .map((script) => script.textContent ?? "")
      .join("\n");
    for (const { technology, pattern } of LEGACY_SCRIPT_PATTERNS) {
      if (pattern.test(scriptSource)) {
        issues.push({
          ruleId: "S11",
          category: "standards",
          severity: "error",
          message: "rules.S11.message.script",
          messageVars: { technology },
        });
      }
    }

    return issues;
  },
};
