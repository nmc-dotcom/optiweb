import type { ProxyResponse, ResourceType } from "../types";

export interface FetchProxyOptions {
  timeoutMs: number;
  /** Extra attempts after the first, on 429/5xx/timeout/network only. Default 1. */
  retries?: number;
  resourceType?: ResourceType;
}

function resourceHint(
  resourceType?: ResourceType,
): "image" | "pdf" | undefined {
  if (resourceType === "image") return "image";
  if (resourceType === "pdf") return "pdf";
  return undefined;
}

function emptyResult(
  url: string,
  errorType: ProxyResponse["errorType"],
  responseTimeMs: number,
): ProxyResponse {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 0,
    statusText: "",
    redirectChain: [],
    isRedirectLoop: false,
    contentType: null,
    xRobotsTag: null,
    bodyTruncated: false,
    responseTimeMs,
    errorType,
  };
}

async function fetchOnce(
  url: string,
  timeoutMs: number,
  resourceType?: ResourceType,
): Promise<ProxyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const params = new URLSearchParams({ url });
  const hint = resourceHint(resourceType);
  if (hint) params.set("type", hint);

  try {
    const res = await fetch(`/api/fetch?${params.toString()}`, {
      signal: controller.signal,
    });

    if (res.status === 400 || res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return emptyResult(
        url,
        data.error === "origin_blocked" ? "origin_blocked" : "ssrf_blocked",
        Date.now() - started,
      );
    }

    return (await res.json()) as ProxyResponse;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return emptyResult(
      url,
      isAbort ? "timeout" : "network",
      Date.now() - started,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isRetryableError(errorType: ProxyResponse["errorType"]): boolean {
  return errorType === "network" || errorType === "timeout";
}

/** Calls the `/api/fetch` proxy with a client-side timeout and one retry on 429/5xx/network/timeout. */
export async function fetchProxy(
  url: string,
  options: FetchProxyOptions,
): Promise<ProxyResponse> {
  const retries = options.retries ?? 1;
  let result = await fetchOnce(url, options.timeoutMs, options.resourceType);

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (
      !isRetryableStatus(result.status) &&
      !isRetryableError(result.errorType)
    )
      break;
    const backoffMs = 300 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    result = await fetchOnce(url, options.timeoutMs, options.resourceType);
  }

  return result;
}
