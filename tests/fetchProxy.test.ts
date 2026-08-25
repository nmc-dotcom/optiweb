import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProxy } from "../src/lib/fetchProxy";

describe("fetchProxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends GET requests that need cookies through the JSON proxy payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          requestedUrl: "https://example.com/protected",
          finalUrl: "https://example.com/protected",
          status: 200,
          statusText: "OK",
          redirectChain: [],
          isRedirectLoop: false,
          contentType: "text/html",
          xRobotsTag: null,
          bodyText: "<html></html>",
          bodyTruncated: false,
          responseTimeMs: 3,
          setCookies: [],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchProxy("https://example.com/protected", {
      timeoutMs: 1_000,
      cookie: "sid=abc123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fetch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/protected",
          method: "GET",
          cookie: "sid=abc123",
        }),
      }),
    );
  });
});
