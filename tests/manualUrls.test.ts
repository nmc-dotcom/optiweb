import { describe, expect, it } from "vitest";
import { parseManualUrlText } from "../src/lib/manualUrls";

describe("parseManualUrlText", () => {
  it("extracts, normalizes, and deduplicates http URLs from pasted spreadsheet text", () => {
    expect(
      parseManualUrlText(`URL\tMemo
https://example.com/path\tmain
www.example.com/about
example.com/path
not a url
https://example.com/path#section`),
    ).toEqual([
      "https://example.com/path",
      "https://www.example.com/about",
      "https://example.com/path#section",
    ]);
  });
});
