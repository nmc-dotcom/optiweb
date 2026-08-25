import type { Issue, IssueSeverity } from "../types";

const LEGACY_CSS_PATTERNS: Array<{
  technology: string;
  pattern: RegExp;
  severity: IssueSeverity;
}> = [
  { technology: "CSS expression()", pattern: /\bexpression\s*\(/gi, severity: "error" },
  { technology: "behavior", pattern: /(?:^|[;{])\s*behavior\s*:/gim, severity: "error" },
  { technology: "-moz-binding", pattern: /(?:^|[;{])\s*-moz-binding\s*:/gim, severity: "error" },
  { technology: "DXImageTransform", pattern: /progid\s*:\s*DXImageTransform\./gi, severity: "error" },
  { technology: "@-moz-document", pattern: /@-moz-document\b/gi, severity: "warning" },
];

const PREFIXED_PROPERTY = /(?:^|[;{])\s*(-(?:webkit|moz|ms|o)-([\w-]+))\s*:/gim;

function stripCommentsAndStrings(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
}

function countMatches(source: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(source)) count += 1;
  return count;
}

/** Static checks for CSS constructs that are obsolete or tied to one legacy engine. */
export function analyzeCssCompatibility(css: string): Issue[] {
  const source = stripCommentsAndStrings(css);
  const issues: Issue[] = [];

  for (const { technology, pattern, severity } of LEGACY_CSS_PATTERNS) {
    const count = countMatches(source, pattern);
    if (count === 0) continue;
    issues.push({
      ruleId: "CSS-LEGACY",
      category: "standards",
      severity,
      message: "rules.CSS-LEGACY.message",
      messageVars: { technology },
      count,
    });
  }

  const missingFallbacks = new Map<string, number>();
  PREFIXED_PROPERTY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PREFIXED_PROPERTY.exec(source))) {
    const prefixed = match[1];
    const standard = match[2];
    if (!prefixed || !standard) continue;
    const blockStart = source.lastIndexOf("{", match.index);
    const blockEnd = source.indexOf("}", match.index);
    const block = source.slice(blockStart + 1, blockEnd === -1 ? source.length : blockEnd);
    const standardPattern = new RegExp(`(?:^|;)\\s*${standard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "im");
    if (!standardPattern.test(block)) {
      missingFallbacks.set(prefixed, (missingFallbacks.get(prefixed) ?? 0) + 1);
    }
  }

  for (const [property, count] of missingFallbacks) {
    issues.push({
      ruleId: "CSS-PREFIX",
      category: "standards",
      severity: "warning",
      message: "rules.CSS-PREFIX.message",
      messageVars: { property },
      count,
    });
  }

  return issues;
}
