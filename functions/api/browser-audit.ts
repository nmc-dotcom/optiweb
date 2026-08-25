interface Env {
  BROWSER_RUNNER_URL?: string;
  BROWSER_RUNNER_TOKEN?: string;
}

interface AuditRequest {
  urls?: unknown;
  browsers?: unknown;
  viewports?: unknown;
  readOnly?: unknown;
}

const ALLOWED_BROWSERS = new Set(["chrome", "edge", "whale"]);
const ALLOWED_VIEWPORT_NAMES = new Set(["desktop", "tablet", "mobile"]);
const MAX_URLS = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validRequest(body: AuditRequest): boolean {
  if (body.readOnly !== true) return false;
  if (
    !Array.isArray(body.urls) ||
    body.urls.length === 0 ||
    body.urls.length > MAX_URLS ||
    !body.urls.every(isHttpUrl)
  )
    return false;
  if (
    !Array.isArray(body.browsers) ||
    body.browsers.length === 0 ||
    !body.browsers.every(
      (browser) => typeof browser === "string" && ALLOWED_BROWSERS.has(browser),
    )
  )
    return false;
  return (
    Array.isArray(body.viewports) &&
    body.viewports.length > 0 &&
    body.viewports.length <= 3 &&
    body.viewports.every(
      (viewport) =>
        typeof viewport === "object" &&
        viewport !== null &&
        "name" in viewport &&
        typeof viewport.name === "string" &&
        ALLOWED_VIEWPORT_NAMES.has(viewport.name) &&
        "width" in viewport &&
        typeof viewport.width === "number" &&
        viewport.width >= 320 &&
        viewport.width <= 2_560 &&
        "height" in viewport &&
        typeof viewport.height === "number" &&
        viewport.height >= 480 &&
        viewport.height <= 1_600,
    )
  );
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BROWSER_RUNNER_URL || !env.BROWSER_RUNNER_TOKEN) {
    return json({ error: "runner_not_configured" }, 503);
  }

  let body: AuditRequest;
  try {
    body = (await request.json()) as AuditRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!validRequest(body)) return json({ error: "invalid_request" }, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  try {
    const response = await fetch(
      `${env.BROWSER_RUNNER_URL.replace(/\/$/, "")}/v1/audit`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.BROWSER_RUNNER_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch {
    return json({ error: "runner_unavailable" }, 502);
  } finally {
    clearTimeout(timeout);
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.BROWSER_RUNNER_URL || !env.BROWSER_RUNNER_TOKEN) {
    return json({ error: "runner_not_configured" }, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `${env.BROWSER_RUNNER_URL.replace(/\/$/, "")}/health`,
      {
        headers: { authorization: `Bearer ${env.BROWSER_RUNNER_TOKEN}` },
        signal: controller.signal,
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return json({ error: "runner_unavailable" }, 502);
  } finally {
    clearTimeout(timeout);
  }
};
