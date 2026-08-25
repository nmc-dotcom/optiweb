import { describe, expect, it } from "vitest";
import { isSafeReadOnlyUrl } from "../src/lib/safeNavigation";

describe("safe read-only navigation", () => {
  it("allows ordinary HTTP pages", () => {
    expect(
      isSafeReadOnlyUrl("https://example.com/products/42?view=detail"),
    ).toBe(true);
  });

  it.each([
    "https://example.com/logout",
    "https://example.com/account/delete/42",
    "https://example.com/admin/users",
    "https://example.com/pay/payment",
    "https://example.com/item?action=remove",
    "https://example.com/item?command=destroy",
  ])("blocks potentially destructive GET URL %s", (url) => {
    expect(isSafeReadOnlyUrl(url)).toBe(false);
  });

  it("does not block harmless words that merely contain a risky substring", () => {
    expect(isSafeReadOnlyUrl("https://example.com/administrator-guide")).toBe(
      true,
    );
    expect(isSafeReadOnlyUrl("https://example.com/remove-stains-safely")).toBe(
      true,
    );
  });
});
