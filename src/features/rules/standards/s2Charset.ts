import type { Rule } from "../types";

const CHARSET_META_PATTERN =
  /<meta[^>]+charset\s*=\s*["']?([\w-]+)["']?[^>]*>/i;
const CONTENT_TYPE_META_PATTERN =
  /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset=([\w-]+)[^"']*["'][^>]*>/i;
const MAX_BYTE_OFFSET = 1024;

function normalizeCharset(value: string): string {
  return value.toLowerCase().replace(/[-_\s]/g, "");
}

// S2 must read raw HTML — byte offset and the exact declared charset both need the
// unparsed source; DOMParser exposes neither (and normalizes encoding away entirely).
export const s2CharsetRule: Rule = {
  id: "S2",
  category: "standards",
  severity: "warning",
  check(ctx) {
    const match =
      CHARSET_META_PATTERN.exec(ctx.html) ??
      CONTENT_TYPE_META_PATTERN.exec(ctx.html);
    if (!match) {
      return [
        {
          ruleId: "S2",
          category: "standards",
          severity: "warning",
          message: "rules.S2.message.missing",
        },
      ];
    }
    const charset = match[1] ?? "";
    if (normalizeCharset(charset) !== "utf8") {
      return [
        {
          ruleId: "S2",
          category: "standards",
          severity: "warning",
          message: "rules.S2.message.notUtf8",
          messageVars: { charset },
        },
      ];
    }
    const byteOffset = new TextEncoder().encode(
      ctx.html.slice(0, match.index),
    ).length;
    if (byteOffset > MAX_BYTE_OFFSET) {
      return [
        {
          ruleId: "S2",
          category: "standards",
          severity: "warning",
          message: "rules.S2.message.tooLate",
          messageVars: { byteOffset },
        },
      ];
    }
    return [];
  },
};
