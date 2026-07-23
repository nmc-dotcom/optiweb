import type { Rule } from "../types";
import { a1AltRule } from "./a1Alt";
import { a2LangRule } from "./a2Lang";
import { a3HeadingRule } from "./a3Heading";
import { a4LabelRule } from "./a4Label";
import { a5AccessibleNameRule } from "./a5AccessibleName";
import { a6GenericLinkTextRule } from "./a6GenericLinkText";
import { a7IframeTitleRule } from "./a7IframeTitle";
import { a8TabindexRule } from "./a8Tabindex";
import { a9DuplicateIdRule } from "./a9DuplicateId";
import { a10ViewportRule } from "./a10Viewport";
import { a11TableHeaderRule } from "./a11TableHeader";
import { a12AriaRule } from "./a12Aria";
import { a13AutoMotionRule } from "./a13AutoMotion";
import { a14NewWindowRule } from "./a14NewWindow";

export const a11yRules: Rule[] = [
  a1AltRule,
  a2LangRule,
  a3HeadingRule,
  a4LabelRule,
  a5AccessibleNameRule,
  a6GenericLinkTextRule,
  a7IframeTitleRule,
  a8TabindexRule,
  a9DuplicateIdRule,
  a10ViewportRule,
  a11TableHeaderRule,
  a12AriaRule,
  a13AutoMotionRule,
  a14NewWindowRule,
];
