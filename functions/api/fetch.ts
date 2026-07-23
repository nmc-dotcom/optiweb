/**
 * Single-URL proxy for the client-side crawler.
 *
 * Free-tier Cloudflare Pages Functions have a 10ms CPU budget and a 50
 * subrequest cap per invocation, so this function does exactly one thing:
 * fetch one URL (stepping through redirects manually so each hop can be
 * SSRF-checked) and hand back status/headers/body as JSON. All crawling
 * orchestration (BFS, concurrency, retries) and all HTML/SEO/a11y parsing
 * happens in the browser — see src/features/crawler.
 *
 * Two independent guard layers, checked in order:
 *   1. Origin/Referer allowlist — stops third parties from calling this
 *      endpoint directly from outside the app and burning the daily quota.
 *   2. SSRF guard on the target URL (and on every redirect hop) — stops the
 *      proxy being used to probe internal/private network addresses.
 */

const MAX_REDIRECTS = 10;
const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const USER_AGENT =
  "HoloradoAuditBot/1.0 (+website audit tool; client-orchestrated crawl)";

const TEXT_CONTENT_TYPES = [
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/json",
  "application/xml",
  "text/xml",
  "text/plain",
];

type ResourceHint = "image" | "pdf" | "other";

interface RedirectHop {
  url: string;
  status: number;
}

// ---------------------------------------------------------------------------
// Layer 1: Origin/Referer allowlist (quota-abuse guard, independent of SSRF)
// ---------------------------------------------------------------------------

function requestOrigin(headers: Headers): string | null {
  const origin = headers.get("origin");
  if (origin) return origin;
  const referer = headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

function isAllowedOrigin(origin: string | null, selfOrigin: string): boolean {
  if (!origin) return false;
  if (origin === selfOrigin) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
  } catch {
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Layer 2: SSRF guard on the target URL
// ---------------------------------------------------------------------------

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  if (octets.some((n) => Number.isNaN(n) || n > 255)) return false;
  const [a, b] = octets as [number, number];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h === "0.0.0.0") return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd"))
    return true; // IPv6 link-local/ULA
  if (isPrivateIPv4(h)) return true;
  return false;
}

type UrlValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: "invalid_url" | "invalid_scheme" | "ssrf_blocked" };

function validateTargetUrl(raw: string): UrlValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid_scheme" };
  }
  if (isBlockedHost(url.hostname)) {
    return { ok: false, reason: "ssrf_blocked" };
  }
  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Body reading (capped at MAX_BODY_BYTES)
// ---------------------------------------------------------------------------

function isTextContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return TEXT_CONTENT_TYPES.includes(base);
}

async function readCappedText(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return text.length > maxBytes
      ? { text: text.slice(0, maxBytes), truncated: true }
      : { text, truncated: false };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      const keep = maxBytes - (total - value.byteLength);
      if (keep > 0) chunks.push(value.slice(0, keep));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return {
    text: new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(
      merged,
    ),
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Redirect stepping
// ---------------------------------------------------------------------------

interface FollowOptions {
  method: "GET" | "HEAD" | "POST";
  body?: string;
  cookieHeader?: string;
}

interface FollowResult {
  finalUrl: string;
  chain: RedirectHop[];
  isRedirectLoop: boolean;
  response?: Response;
  /** Set-Cookie headers seen across every hop of this call (raw, unparsed). */
  setCookies: string[];
  errorType?: "timeout" | "network" | "ssrf_blocked" | "too_many_redirects";
}

async function followRedirects(
  startUrl: URL,
  options: FollowOptions,
): Promise<FollowResult> {
  const chain: RedirectHop[] = [];
  const seen = new Set<string>();
  const setCookies: string[] = [];
  let current = startUrl;
  let method = options.method;
  let body = options.body;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const key = current.toString();
    if (seen.has(key)) {
      return { finalUrl: key, chain, isRedirectLoop: true, setCookies };
    }
    seen.add(key);

    const validation = validateTargetUrl(key);
    if (!validation.ok) {
      return {
        finalUrl: key,
        chain,
        isRedirectLoop: false,
        errorType: "ssrf_blocked",
        setCookies,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT };
      if (options.cookieHeader) headers["Cookie"] = options.cookieHeader;
      if (method === "POST")
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      res = await fetch(current.toString(), {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers,
        body: method === "POST" ? body : undefined,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return {
        finalUrl: key,
        chain,
        isRedirectLoop: false,
        errorType: isAbort ? "timeout" : "network",
        setCookies,
      };
    }
    clearTimeout(timeoutId);

    for (const cookie of res.headers.getSetCookie()) setCookies.push(cookie);

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      chain.push({ url: key, status: res.status });
      try {
        current = new URL(location, current);
      } catch {
        return {
          finalUrl: key,
          chain,
          isRedirectLoop: false,
          errorType: "network",
          setCookies,
        };
      }
      // Browser-realistic redirect semantics: 303 (and, by long-standing real-world
      // convention that servers rely on, 301/302 too) downgrades POST to GET and drops the
      // body; 307/308 preserve method+body.
      if (
        method === "POST" &&
        (res.status === 301 || res.status === 302 || res.status === 303)
      ) {
        method = "GET";
        body = undefined;
      }
      continue;
    }

    return {
      finalUrl: key,
      chain,
      isRedirectLoop: false,
      response: res,
      setCookies,
    };
  }

  return {
    finalUrl: current.toString(),
    chain,
    isRedirectLoop: false,
    errorType: "too_many_redirects",
    setCookies,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const selfOrigin = new URL(request.url).origin;

  const origin = requestOrigin(request.headers);
  if (!isAllowedOrigin(origin, selfOrigin)) {
    return json(
      {
        error: "origin_blocked",
        message: "Requests must originate from this app.",
      },
      403,
    );
  }

  const requestedUrl = new URL(request.url).searchParams.get("url");
  if (!requestedUrl) {
    return json({ error: "missing_url" }, 400);
  }

  const hintParam = new URL(request.url).searchParams.get("type");
  const hint: ResourceHint =
    hintParam === "image" || hintParam === "pdf" ? hintParam : "other";

  const initialValidation = validateTargetUrl(requestedUrl);
  if (!initialValidation.ok) {
    return json({ error: initialValidation.reason }, 400);
  }

  const method: "GET" | "HEAD" =
    hint === "image" || hint === "pdf" ? "HEAD" : "GET";
  const startedAt = Date.now();
  const result = await followRedirects(initialValidation.url, { method });

  if (result.errorType || !result.response) {
    return json({
      requestedUrl,
      finalUrl: result.finalUrl,
      status: 0,
      statusText: "",
      redirectChain: result.chain,
      isRedirectLoop: result.isRedirectLoop,
      contentType: null,
      xRobotsTag: null,
      bodyTruncated: false,
      responseTimeMs: Date.now() - startedAt,
      errorType:
        result.errorType ??
        (result.isRedirectLoop ? "too_many_redirects" : "network"),
      setCookies: result.setCookies,
    });
  }

  const res = result.response;
  const contentType = res.headers.get("content-type");
  const xRobotsTag = res.headers.get("x-robots-tag");

  let bodyText: string | undefined;
  let bodyTruncated = false;
  if (method === "GET" && isTextContentType(contentType)) {
    const read = await readCappedText(res, MAX_BODY_BYTES);
    bodyText = read.text;
    bodyTruncated = read.truncated;
  }

  return json({
    requestedUrl,
    finalUrl: result.finalUrl,
    status: res.status,
    statusText: res.statusText,
    redirectChain: result.chain,
    isRedirectLoop: result.isRedirectLoop,
    contentType,
    xRobotsTag,
    bodyText,
    bodyTruncated,
    responseTimeMs: Date.now() - startedAt,
    setCookies: result.setCookies,
  });
};

// ---------------------------------------------------------------------------
// POST handler — used only by the SSO auto-follow feature (src/features/crawler/ssoFollow.ts)
// to submit a hidden-only bootstrap form and carry a Cookie header. The client sends the
// target url/method/body/cookie as a JSON body (not query params) since SSO hidden-field
// payloads like a SAMLRequest can be several KB, too large to safely round-trip in a URL.
// ---------------------------------------------------------------------------

interface SsoPostPayload {
  url?: unknown;
  method?: unknown;
  body?: unknown;
  cookie?: unknown;
}

export const onRequestPost: PagesFunction = async (context) => {
  const { request } = context;
  const selfOrigin = new URL(request.url).origin;

  const origin = requestOrigin(request.headers);
  if (!isAllowedOrigin(origin, selfOrigin)) {
    return json(
      {
        error: "origin_blocked",
        message: "Requests must originate from this app.",
      },
      403,
    );
  }

  let payload: SsoPostPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const requestedUrl = typeof payload.url === "string" ? payload.url : null;
  if (!requestedUrl) {
    return json({ error: "missing_url" }, 400);
  }

  const initialValidation = validateTargetUrl(requestedUrl);
  if (!initialValidation.ok) {
    return json({ error: initialValidation.reason }, 400);
  }

  const method: "GET" | "POST" = payload.method === "GET" ? "GET" : "POST";
  const body =
    method === "POST" && typeof payload.body === "string"
      ? payload.body
      : undefined;
  const cookieHeader =
    typeof payload.cookie === "string" ? payload.cookie : undefined;

  const startedAt = Date.now();
  const result = await followRedirects(initialValidation.url, {
    method,
    body,
    cookieHeader,
  });

  if (result.errorType || !result.response) {
    return json({
      requestedUrl,
      finalUrl: result.finalUrl,
      status: 0,
      statusText: "",
      redirectChain: result.chain,
      isRedirectLoop: result.isRedirectLoop,
      contentType: null,
      xRobotsTag: null,
      bodyTruncated: false,
      responseTimeMs: Date.now() - startedAt,
      errorType:
        result.errorType ??
        (result.isRedirectLoop ? "too_many_redirects" : "network"),
      setCookies: result.setCookies,
    });
  }

  const res = result.response;
  const contentType = res.headers.get("content-type");
  const xRobotsTag = res.headers.get("x-robots-tag");

  let bodyText: string | undefined;
  let bodyTruncated = false;
  if (isTextContentType(contentType)) {
    const read = await readCappedText(res, MAX_BODY_BYTES);
    bodyText = read.text;
    bodyTruncated = read.truncated;
  }

  return json({
    requestedUrl,
    finalUrl: result.finalUrl,
    status: res.status,
    statusText: res.statusText,
    redirectChain: result.chain,
    isRedirectLoop: result.isRedirectLoop,
    contentType,
    xRobotsTag,
    bodyText,
    bodyTruncated,
    responseTimeMs: Date.now() - startedAt,
    setCookies: result.setCookies,
  });
};
