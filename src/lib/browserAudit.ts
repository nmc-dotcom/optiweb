import type {
  BrowserAuditResult,
  BrowserName,
  BrowserViewportResult,
} from "../types";

const BROWSERS: BrowserName[] = ["chrome", "edge", "whale"];
const DEFAULT_VIEWPORTS: Array<
  Pick<BrowserViewportResult, "name" | "width" | "height">
> = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

interface BrowserAuditResponse {
  results?: BrowserAuditResult[];
  error?: string;
}

export interface BrowserRunnerHealth {
  ok: boolean;
  busy: boolean;
  browsers: Array<{ browser: BrowserName; installed: boolean }>;
}

export interface BrowserAuditProgressUpdate {
  completed: number;
  total: number;
}

const RETRYABLE_STATUSES = new Set([429, 502, 504]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function postAuditBatch(
  batch: string[],
  signal: AbortSignal,
): Promise<BrowserAuditResult[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("/api/browser-audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        urls: batch,
        browsers: BROWSERS,
        viewports: DEFAULT_VIEWPORTS,
        readOnly: true,
      }),
      signal,
    });
    const body = (await response
      .json()
      .catch(() => ({}))) as BrowserAuditResponse;
    if (response.ok) {
      if (!Array.isArray(body.results))
        throw new Error("runner_invalid_response");
      return body.results;
    }
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === 2) {
      throw new Error(body.error ?? `runner_http_${response.status}`);
    }
    await wait(750 * 2 ** attempt);
  }
  throw new Error("runner_unavailable");
}

export async function getBrowserRunnerHealth(
  timeoutMs = 10_000,
): Promise<BrowserRunnerHealth> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/browser-audit", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as
      BrowserRunnerHealth | { error?: string };
    if (!response.ok || !("ok" in body) || body.ok !== true) {
      throw new Error(
        "error" in body ? body.error : `runner_http_${response.status}`,
      );
    }
    return body;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function unavailableBrowserResults(
  urls: string[],
  reason: string,
  now = Date.now(),
): BrowserAuditResult[] {
  return urls.flatMap((url) =>
    BROWSERS.map((browser) => ({
      url,
      browser,
      functionalStatus: "unavailable" as const,
      visualStatus: "unavailable" as const,
      issues: [],
      viewports: [],
      durationMs: 0,
      checkedAt: now,
      unavailableReason: reason,
    })),
  );
}

export async function runBrowserAudit(
  urls: string[],
  timeoutMs = 300_000,
  onProgress?: (progress: BrowserAuditProgressUpdate) => void,
): Promise<{ results: BrowserAuditResult[]; available: boolean }> {
  const uniqueUrls = [...new Set(urls)].slice(0, 100);
  onProgress?.({ completed: 0, total: uniqueUrls.length });
  if (uniqueUrls.length === 0) return { results: [], available: true };

  const results: BrowserAuditResult[] = [];
  let available = true;
  for (let offset = 0; offset < uniqueUrls.length; offset += 10) {
    const batch = uniqueUrls.slice(offset, offset + 10);
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      results.push(...(await postAuditBatch(batch, controller.signal)));
    } catch (error) {
      available = false;
      const reason =
        error instanceof Error ? error.message : "runner_unavailable";
      results.push(...unavailableBrowserResults(batch, reason));
    } finally {
      globalThis.clearTimeout(timeout);
      onProgress?.({
        completed: Math.min(offset + batch.length, uniqueUrls.length),
        total: uniqueUrls.length,
      });
    }
  }
  return { results, available };
}
