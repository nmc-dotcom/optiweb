import { describe, expect, it } from "vitest";
import { analyzeCssCompatibility } from "../src/features/rules/standards/cssCompatibility";

describe("CSS compatibility checks", () => {
  it("detects legacy CSS technologies", () => {
    const issues = analyzeCssCompatibility(`
      .old { width: expression(document.body.clientWidth); behavior: url(legacy.htc); }
    `);

    expect(issues.map((issue) => issue.ruleId)).toEqual([
      "CSS-LEGACY",
      "CSS-LEGACY",
    ]);
    expect(issues.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("only reports a vendor prefix when the standard fallback is absent", () => {
    const issues = analyzeCssCompatibility(`
      .with-fallback { -webkit-user-select: none; user-select: none; }
      .without-fallback { -moz-appearance: none; }
    `);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.ruleId).toBe("CSS-PREFIX");
    expect(issues[0]?.messageVars).toEqual({ property: "-moz-appearance" });
  });

  it("ignores patterns inside comments", () => {
    expect(
      analyzeCssCompatibility(`
        /* behavior: url(old.htc); */
        .label::before { content: "expression(document.all)"; }
      `),
    ).toEqual([]);
  });
});
