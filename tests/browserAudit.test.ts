import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserRunnerHealth,
  runBrowserAudit,
  unavailableBrowserResults,
} from "../src/lib/browserAudit";

describe("browser audit client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never treats a missing runner as a passing browser result", () => {
    const results = unavailableBrowserResults(
      ["https://example.com"],
      "runner_not_configured",
      123,
    );
    expect(results).toHaveLength(3);
    expect(
      results.every((result) => result.functionalStatus === "unavailable"),
    ).toBe(true);
    expect(
      results.every((result) => result.visualStatus === "unavailable"),
    ).toBe(true);
    expect(results.every((result) => result.checkedAt === 123)).toBe(true);
  });

  it("splits large audits into batches of ten URLs", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const urls = Array.from(
      { length: 21 },
      (_, index) => `https://example.com/page-${index}`,
    );

    const progress = vi.fn();
    await runBrowserAudit(urls, 1_000, progress);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const batchSizes = fetchMock.mock.calls.map(([, init]) => {
      const body = JSON.parse(String(init?.body)) as { urls: string[] };
      return body.urls.length;
    });
    expect(batchSizes).toEqual([10, 10, 1]);
    expect(progress).toHaveBeenLastCalledWith({ completed: 21, total: 21 });
  });

  it("reads runner health through the same-origin Pages endpoint", async () => {
    const health = {
      ok: true,
      busy: false,
      browsers: [{ browser: "chrome" as const, installed: true }],
    };
    const fetchMock = vi.fn(async () => Response.json(health));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBrowserRunnerHealth()).resolves.toEqual(health);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/browser-audit",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });
});
