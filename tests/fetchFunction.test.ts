import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet, onRequestPost } from "../functions/api/fetch";

describe("fetch Pages Function SSRF guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks IPv6-mapped loopback addresses before fetching", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request(
      "https://audit.example.test/api/fetch?url=http%3A%2F%2F%5B%3A%3Affff%3A127.0.0.1%5D%2F",
      { headers: { origin: "https://audit.example.test" } },
    );

    const response = await onRequestGet({ request } as EventContext<
      unknown,
      string,
      unknown
    >);
    const data = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe("ssrf_blocked");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks redirects to an unrelated host before fetching the second hop", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://unrelated.example.net/landing" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request(
      "https://audit.example.test/api/fetch?url=https%3A%2F%2Fexample.com%2F",
      { headers: { origin: "https://audit.example.test" } },
    );
    const response = await onRequestGet({ request } as EventContext<
      unknown,
      string,
      unknown
    >);
    const data = (await response.json()) as { errorType?: string };

    expect(data.errorType).toBe("origin_blocked");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects every POST in read-only mode", async () => {
    const request = new Request("https://audit.example.test/api/fetch", {
      method: "POST",
      headers: { origin: "https://audit.example.test" },
      body: JSON.stringify({ url: "https://example.com", method: "POST" }),
    });
    const response = await onRequestPost({ request } as EventContext<
      unknown,
      string,
      unknown
    >);
    const data = (await response.json()) as { error?: string };

    expect(response.status).toBe(405);
    expect(data.error).toBe("read_only_mode");
  });
});
