import http from "node:http";
import { readFileSync } from "node:fs";
import { browserCapabilities, runAudit } from "./audit.mjs";

const PORT = Number(process.env.PORT ?? 8788);
const TOKEN = process.env.RUNNER_API_TOKEN_FILE
  ? readFileSync(process.env.RUNNER_API_TOKEN_FILE, "utf8").trim()
  : process.env.RUNNER_API_TOKEN;
const MAX_BODY_BYTES = 256 * 1024;
const ALLOWED_BROWSERS = new Set(["chrome", "edge", "whale"]);
const ALLOWED_VIEWPORTS = new Set(["desktop", "tablet", "mobile"]);
let activeAudit = false;

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validBody(body) {
  return (
    body?.readOnly === true &&
    Array.isArray(body.urls) &&
    body.urls.length > 0 &&
    body.urls.length <= 100 &&
    body.urls.every((url) => typeof url === "string" && url.length <= 2_048) &&
    Array.isArray(body.browsers) &&
    body.browsers.length > 0 &&
    body.browsers.every((browser) => ALLOWED_BROWSERS.has(browser)) &&
    Array.isArray(body.viewports) &&
    body.viewports.length > 0 &&
    body.viewports.length <= 3 &&
    body.viewports.every(
      (viewport) =>
        ALLOWED_VIEWPORTS.has(viewport?.name) &&
        Number.isInteger(viewport.width) &&
        viewport.width >= 320 &&
        viewport.width <= 2_560 &&
        Number.isInteger(viewport.height) &&
        viewport.height >= 480 &&
        viewport.height <= 1_600,
    )
  );
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    if (!TOKEN || request.headers.authorization !== `Bearer ${TOKEN}`)
      return send(response, 401, { error: "unauthorized" });
    return send(response, 200, {
      ok: true,
      busy: activeAudit,
      browsers: browserCapabilities(),
    });
  }
  if (request.method !== "POST" || request.url !== "/v1/audit")
    return send(response, 404, { error: "not_found" });
  if (!TOKEN || request.headers.authorization !== `Bearer ${TOKEN}`)
    return send(response, 401, { error: "unauthorized" });
  if (activeAudit) return send(response, 429, { error: "runner_busy" });

  try {
    const body = await readJson(request);
    if (!validBody(body))
      return send(response, 400, { error: "invalid_request" });
    activeAudit = true;
    return send(response, 200, await runAudit(body));
  } catch (error) {
    return send(response, 500, {
      error: error instanceof Error ? error.message : "audit_failed",
    });
  } finally {
    activeAudit = false;
  }
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`Optiweb browser runner listening on ${PORT}\n`);
});
