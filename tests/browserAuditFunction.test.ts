import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet, onRequestPost } from "../functions/api/browser-audit";

function context(body: unknown, env: Record<string, string> = {}) {
  return {
    request: new Request("https://audit.example.test/api/browser-audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  } as unknown as EventContext<Record<string, string>, string, unknown>;
}

const validBody = {
  urls: ["https://example.com"],
  browsers: ["chrome", "edge", "whale"],
  viewports: [{ name: "mobile", width: 390, height: 844 }],
  readOnly: true,
};

function getContext(env: Record<string, string> = {}) {
  return {
    request: new Request("https://audit.example.test/api/browser-audit"),
    env,
  } as unknown as EventContext<Record<string, string>, string, unknown>;
}

describe("browser audit Pages Function", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports unavailable when runner secrets are not configured", async () => {
    const response = await onRequestPost(context(validBody));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "runner_not_configured",
    });
  });

  it("rejects requests that do not explicitly select read-only mode", async () => {
    const response = await onRequestPost(
      context(
        { ...validBody, readOnly: false },
        {
          BROWSER_RUNNER_URL: "https://runner.test",
          BROWSER_RUNNER_TOKEN: "secret",
        },
      ),
    );
    expect(response.status).toBe(400);
  });

  it("forwards only validated requests with the server-side bearer token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await onRequestPost(
      context(validBody, {
        BROWSER_RUNNER_URL: "https://runner.test/",
        BROWSER_RUNNER_TOKEN: "secret",
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://runner.test/v1/audit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer secret" }),
      }),
    );
  });

  it("proxies authenticated runner health without exposing the token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, busy: false, browsers: [] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await onRequestGet(
      getContext({
        BROWSER_RUNNER_URL: "https://runner.test/",
        BROWSER_RUNNER_TOKEN: "secret",
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://runner.test/health",
      expect.objectContaining({
        headers: { authorization: "Bearer secret" },
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
