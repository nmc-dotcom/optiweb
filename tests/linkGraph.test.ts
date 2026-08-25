import { describe, expect, it } from "vitest";
import { buildLinkGraph } from "../src/lib/linkGraph";
import type { LinkResult } from "../src/types";

function link(partial: Partial<LinkResult>): LinkResult {
  return {
    id: partial.id ?? "id",
    sourceUrl: partial.sourceUrl ?? "https://example.com/",
    targetUrl: partial.targetUrl ?? "https://example.com/about",
    resourceType: partial.resourceType ?? "page",
    status: partial.status ?? 200,
    redirectChain: partial.redirectChain ?? [],
    isRedirectLoop: false,
    responseTimeMs: 10,
    isExternal: partial.isExternal ?? false,
    isBroken: partial.isBroken ?? false,
    category: "link",
    severity: partial.severity ?? "info",
    issue: partial.issue ?? "정상",
  };
}

describe("buildLinkGraph", () => {
  it("builds page nodes and excludes non-page assets", () => {
    const graph = buildLinkGraph([
      link({ id: "1", sourceUrl: "", targetUrl: "https://example.com/" }),
      link({ id: "2", sourceUrl: "https://example.com/", targetUrl: "https://example.com/about" }),
      link({ id: "3", sourceUrl: "https://example.com/", targetUrl: "https://cdn.example.com/logo.png", resourceType: "image" }),
      link({ id: "4", sourceUrl: "https://example.com/about", targetUrl: "https://bad.example.com/", isExternal: true, isBroken: true, severity: "error" }),
    ]);

    expect(graph.nodes.map((node) => node.url)).toEqual([
      "https://example.com/",
      "https://example.com/about",
      "https://bad.example.com/",
    ]);
    expect(graph.edges).toEqual([
      {
        id: "edge-2",
        source: "https://example.com/",
        target: "https://example.com/about",
        severity: "info",
        isBroken: false,
        isExternal: false,
      },
      {
        id: "edge-4",
        source: "https://example.com/about",
        target: "https://bad.example.com/",
        severity: "error",
        isBroken: true,
        isExternal: true,
      },
    ]);
  });
});
