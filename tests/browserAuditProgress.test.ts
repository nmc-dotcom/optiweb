import { describe, expect, it } from "vitest";
import { estimateBrowserAuditProgress } from "../src/lib/browserAuditProgress";

describe("estimateBrowserAuditProgress", () => {
  it("advances an estimate before the first result arrives", () => {
    expect(estimateBrowserAuditProgress(0, 1, 4_000, true)).toEqual({
      percent: 50,
      elapsedSeconds: 4,
      remainingSeconds: 4,
    });
  });

  it("never reports 100 percent while an audit is still running", () => {
    expect(estimateBrowserAuditProgress(0, 1, 30_000, true).percent).toBe(95);
  });

  it("uses observed progress for a multi-page estimate", () => {
    expect(estimateBrowserAuditProgress(10, 20, 80_000, true)).toEqual({
      percent: 50,
      elapsedSeconds: 80,
      remainingSeconds: 80,
    });
  });

  it("reports 100 percent only after completion", () => {
    expect(estimateBrowserAuditProgress(1, 1, 3_000, false).percent).toBe(100);
  });
});
