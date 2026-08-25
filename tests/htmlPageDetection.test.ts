import { describe, expect, it } from "vitest";
import {
  hasExplicitBody,
  resourceTypeFromResponse,
} from "../src/features/crawler/crawlEngine";

describe("HTML page detection", () => {
  it("accepts HTML documents with an explicit body element", () => {
    expect(hasExplicitBody("<!doctype html><HTML><BODY>ok</BODY></HTML>")).toBe(
      true,
    );
  });

  it("does not treat HTML fragments as body pages", () => {
    expect(hasExplicitBody("<div>fragment</div>")).toBe(false);
  });

  it("classifies successful resources from their response content type", () => {
    expect(resourceTypeFromResponse("text/html", "page", true)).toBe("page");
    expect(resourceTypeFromResponse("text/html", "page", false)).toBe("other");
    expect(resourceTypeFromResponse("text/css", "page", false)).toBe("css");
    expect(resourceTypeFromResponse("image/webp", "page", false)).toBe("image");
    expect(
      resourceTypeFromResponse("application/javascript", "page", false),
    ).toBe("js");
  });
});
