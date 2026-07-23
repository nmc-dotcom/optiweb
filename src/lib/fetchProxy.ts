import type { ProxyResponse, ResourceType } from "../types";

export interface FetchProxyOptions {
  timeoutMs: number;
  /** Extra attempts after the first, on 429/5xx/timeout/network only. Default 1. */
  retries?: number;
  resourceType?: ResourceType;
  /** POST is used only by the SSO auto-follow feature (ssoFollow.ts) to submit a form. */
  method?: "GET" | "POST";
  /** application/x-www-form-urlencoded body, POST only. */
  body?: string;
  /** Cookie header value to send to the target (assembled by the caller's CookieJar). */
  cookie?: string;
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
    setCookies: [],
  };
}

async function handleGuardResponse(
  res: Response,
  url: string,
  started: number,
): Promise<ProxyResponse | null> {
  if (res.status !== 400 && res.status !== 403) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return emptyResult(
    url,
    data.error === "origin_blocked" ? "origin_blocked" : "ssrf_blocked",
    Date.now() - started,
  );
}

async function fetchOnce(
  url: string,
  timeoutMs: number,
  options: FetchProxyOptions,
): Promise<ProxyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    let res: Response;
    if (options.method === "POST") {
      res = await fetch("/api/fetch", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          method: "POST",
          body: options.body,
          cookie: options.cookie,
        }),
      });
    } else {
      const params = new URLSearchParams({ url });
      const hint = resourceHint(options.resourceType);
      if (hint) params.set("type", hint);
      res = await fetch(`/api/fetch?${params.toString()}`, {
        signal: controller.signal,
      });
    }

    const guardResult = await handleGuardResponse(res, url, started);
    if (guardResult) return guardResult;

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
  let result = await fetchOnce(url, options.timeoutMs, options);

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (
      !isRetryableStatus(result.status) &&
      !isRetryableError(result.errorType)
    )
      break;
    const backoffMs = 300 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    result = await fetchOnce(url, options.timeoutMs, options);
  }

  return result;
}
