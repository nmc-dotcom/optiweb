const MAX_SOURCE_BYTES = 1024 * 1024;
const VALIDATOR_TIMEOUT_MS = 20_000;
const USER_AGENT = "HoloradoAuditBot/1.0 (+website standards audit tool)";

type ValidationKind = "html" | "css";

interface ValidatePayload {
  kind?: unknown;
  source?: unknown;
  url?: unknown;
}

interface NormalizedMessage {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  extract?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requestOrigin(headers: Headers): string | null {
  const origin = headers.get("origin");
  if (origin) return origin;
  const referer = headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string | null, selfOrigin: string): boolean {
  if (!origin) return false;
  if (origin === selfOrigin) return true;
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function normalizeHtmlMessages(data: unknown): NormalizedMessage[] {
  if (!data || typeof data !== "object") return [];
  const messages = (data as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];

  return messages.flatMap((entry): NormalizedMessage[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.message !== "string") return [];
    const severity =
      item.type === "error"
        ? "error"
        : item.subtype === "warning"
          ? "warning"
          : "info";
    return [
      {
        severity,
        message: item.message,
        line: typeof item.lastLine === "number" ? item.lastLine : undefined,
        extract:
          typeof item.extract === "string"
            ? item.extract.trim().slice(0, 200)
            : undefined,
      },
    ];
  });
}

function normalizeCssEntries(
  entries: unknown,
  severity: "error" | "warning",
): NormalizedMessage[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry): NormalizedMessage[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const message =
      typeof item.message === "string"
        ? item.message
        : typeof item.type === "string"
          ? item.type
          : null;
    if (!message) return [];
    const lineValue =
      typeof item.line === "number" ? item.line : Number(item.line);
    return [
      {
        severity,
        message,
        line: Number.isFinite(lineValue) ? lineValue : undefined,
        extract:
          typeof item.context === "string"
            ? item.context.trim().slice(0, 200)
            : undefined,
      },
    ];
  });
}

function normalizeCssMessages(data: unknown): NormalizedMessage[] {
  if (!data || typeof data !== "object") return [];
  const validation = (data as { cssvalidation?: unknown }).cssvalidation;
  if (!validation || typeof validation !== "object") return [];
  const result = validation as Record<string, unknown>;
  return [
    ...normalizeCssEntries(result.errors, "error"),
    ...normalizeCssEntries(result.warnings, "warning"),
  ];
}

function hasNonDocumentError(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const messages = (data as { messages?: unknown }).messages;
  return (
    !Array.isArray(messages) ||
    messages.some((entry) =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        (entry as { type?: unknown }).type === "non-document-error",
      ),
    )
  );
}

async function fetchNuByUrl(
  url: string,
  signal: AbortSignal,
): Promise<NormalizedMessage[] | null> {
  const params = new URLSearchParams({ doc: url, out: "json" });
  const response = await fetch(
    `https://validator.w3.org/nu/?${params.toString()}`,
    {
      headers: { "user-agent": USER_AGENT },
      signal,
    },
  );
  if (!response.ok) return null;
  const data: unknown = await response.json();
  // A URL that W3C cannot reach (private network, authentication, robots, etc.)
  // produces a non-document-error. In that case, validate the source we already
  // fetched instead of reporting a misleading checker failure.
  return hasNonDocumentError(data) ? null : normalizeHtmlMessages(data);
}

async function callValidator(
  kind: ValidationKind,
  source: string,
  targetUrl?: string,
): Promise<NormalizedMessage[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATOR_TIMEOUT_MS);
  try {
    if (kind === "html") {
      if (targetUrl) {
        try {
          const urlResult = await fetchNuByUrl(targetUrl, controller.signal);
          if (urlResult) return urlResult;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError")
            throw error;
          // Network failure while W3C fetches the URL: continue with source POST.
        }
      }
      const response = await fetch("https://validator.w3.org/nu/?out=json", {
        method: "POST",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "user-agent": USER_AGENT,
        },
        body: source,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`validator_http_${response.status}`);
      return normalizeHtmlMessages(await response.json());
    }

    const form = new URLSearchParams({
      text: source,
      output: "json",
      profile: "css3svg",
      warning: "2",
    });
    const response = await fetch(
      "https://jigsaw.w3.org/css-validator/validator",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
          "user-agent": USER_AGENT,
        },
        body: form.toString(),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`validator_http_${response.status}`);
    return normalizeCssMessages(await response.json());
  } finally {
    clearTimeout(timeoutId);
  }
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  const selfOrigin = new URL(request.url).origin;
  if (!isAllowedOrigin(requestOrigin(request.headers), selfOrigin)) {
    return json({ error: "origin_blocked" }, 403);
  }

  let payload: ValidatePayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const kind =
    payload.kind === "html" || payload.kind === "css" ? payload.kind : null;
  const source = typeof payload.source === "string" ? payload.source : null;
  let targetUrl: string | undefined;
  if (typeof payload.url === "string" && payload.url.length <= 2_048) {
    try {
      const parsed = new URL(payload.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        targetUrl = parsed.toString();
      }
    } catch {
      // Invalid URLs simply use source validation below.
    }
  }
  if (!kind || source === null) return json({ error: "invalid_payload" }, 400);
  if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    return json({ error: "source_too_large" }, 413);
  }

  try {
    const messages = await callValidator(
      kind,
      source,
      kind === "html" ? targetUrl : undefined,
    );
    return json({ kind, messages });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "validator_unavailable";
    return json({ error: reason }, 502);
  }
};
