import type { Issue, IssueSeverity } from "../features/rules/types";

type ValidationKind = "html" | "css";

interface ValidatorMessage {
  severity: IssueSeverity;
  message: string;
  line?: number;
  extract?: string;
}

interface ValidatorResponse {
  messages?: ValidatorMessage[];
  error?: string;
}

let validationQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestValidation(
  kind: ValidationKind,
  source: string,
  targetUrl?: string,
): Promise<ValidatorResponse> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < 1_000) await wait(1_000 - elapsed);
  lastRequestAt = Date.now();

  const response = await fetch("/api/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, source, url: targetUrl }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`api_http_${response.status}`);
  }
  const data = (await response.json()) as ValidatorResponse;
  if (!response.ok)
    throw new Error(data.error ?? `validator_http_${response.status}`);
  return data;
}

function enqueueValidation(
  kind: ValidationKind,
  source: string,
  targetUrl?: string,
): Promise<ValidatorResponse> {
  const result = validationQueue.then(() =>
    requestValidation(kind, source, targetUrl),
  );
  validationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Runs the official validator serially, respecting the public CSS service's batch-use delay. */
export async function validateW3c(
  kind: ValidationKind,
  source: string,
  targetUrl?: string,
): Promise<Issue[]> {
  try {
    const data = await enqueueValidation(kind, source, targetUrl);
    const ruleId = kind === "html" ? "W3C-HTML" : "W3C-CSS";
    const messages = data.messages ?? [];
    if (messages.length === 0) {
      return [
        {
          ruleId,
          category: "standards",
          severity: "info",
          message: "rules.W3C.valid",
          messageVars: { validator: kind.toUpperCase() },
        },
      ];
    }
    return messages.map((entry) => ({
      ruleId,
      category: "standards",
      severity: entry.severity,
      message: "rules.W3C.message",
      messageVars: {
        validator: kind.toUpperCase(),
        line: entry.line ?? "—",
        detail: entry.message,
      },
      element: entry.extract,
    }));
  } catch (error) {
    return [
      {
        ruleId: kind === "html" ? "W3C-HTML" : "W3C-CSS",
        category: "standards",
        severity: "info",
        message: "rules.W3C.unavailable",
        messageVars: {
          validator: kind.toUpperCase(),
          reason: error instanceof Error ? error.message : "unknown",
        },
      },
    ];
  }
}
