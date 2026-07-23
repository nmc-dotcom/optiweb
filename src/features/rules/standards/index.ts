import type { Rule } from "../types";
import { s1DoctypeRule } from "./s1Doctype";
import { s2CharsetRule } from "./s2Charset";
import { s3ViewportRule } from "./s3Viewport";
import { s4DeprecatedElementsRule } from "./s4DeprecatedElements";
import { s5DeprecatedAttributesRule } from "./s5DeprecatedAttributes";
import { s6DuplicateIdRule } from "./s6DuplicateId";
import { s7InvalidNestingRule } from "./s7InvalidNesting";
import { s8HreflangRule } from "./s8Hreflang";
import { s9MixedContentRule } from "./s9MixedContent";
import { s10InlineHandlersRule } from "./s10InlineHandlers";

export const standardsRules: Rule[] = [
  s1DoctypeRule,
  s2CharsetRule,
  s3ViewportRule,
  s4DeprecatedElementsRule,
  s5DeprecatedAttributesRule,
  s6DuplicateIdRule,
  s7InvalidNestingRule,
  s8HreflangRule,
  s9MixedContentRule,
  s10InlineHandlersRule,
];
