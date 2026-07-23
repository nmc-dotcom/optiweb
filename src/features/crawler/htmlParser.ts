import type { ResourceType } from "../../types";
import { resolveUrl } from "../../lib/url";

export interface ExtractedLink {
  url: string;
  resourceType: ResourceType;
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function classifyAnchorTarget(url: string): ResourceType {
  try {
    if (new URL(url).pathname.toLowerCase().endsWith(".pdf")) return "pdf";
  } catch {
    // ignore - fall through to 'page'
  }
  return "page";
}

function parseSrcset(srcset: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const part of srcset.split(",")) {
    const candidate = part.trim().split(/\s+/)[0];
    if (!candidate) continue;
    const resolved = resolveUrl(candidate, baseUrl);
    if (resolved && isHttpUrl(resolved)) urls.push(resolved);
  }
  return urls;
}

/** Extracts crawlable links/assets from HTML via DOMParser (runs in the browser, not the proxy). */
export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<string>();
  const results: ExtractedLink[] = [];

  const add = (url: string, resourceType: ResourceType) => {
    const key = `${resourceType}:${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ url, resourceType });
  };

  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (!href) continue;
    const resolved = resolveUrl(href, baseUrl);
    if (resolved && isHttpUrl(resolved))
      add(resolved, classifyAnchorTarget(resolved));
  }

  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (src) {
      const resolved = resolveUrl(src, baseUrl);
      if (resolved && isHttpUrl(resolved)) add(resolved, "image");
    }
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      for (const url of parseSrcset(srcset, baseUrl)) add(url, "image");
    }
  }

  for (const link of Array.from(
    doc.querySelectorAll('link[rel~="stylesheet"][href]'),
  )) {
    const href = link.getAttribute("href");
    if (!href) continue;
    const resolved = resolveUrl(href, baseUrl);
    if (resolved && isHttpUrl(resolved)) add(resolved, "css");
  }

  for (const script of Array.from(doc.querySelectorAll("script[src]"))) {
    const src = script.getAttribute("src");
    if (!src) continue;
    const resolved = resolveUrl(src, baseUrl);
    if (resolved && isHttpUrl(resolved)) add(resolved, "js");
  }

  for (const iframe of Array.from(doc.querySelectorAll("iframe[src]"))) {
    const src = iframe.getAttribute("src");
    if (!src) continue;
    const resolved = resolveUrl(src, baseUrl);
    if (resolved && isHttpUrl(resolved)) add(resolved, "iframe");
  }

  return results;
}

export type JsRedirectType =
  "meta-refresh" | "form-submit" | "no-links-external-form";

export interface JsRedirectDetection {
  type: JsRedirectType;
  /** Hostname the page hands off to (form action / meta-refresh target), if resolvable. */
  targetHost: string | null;
  /** Populated for 'form-submit'/'no-links-external-form' only (both have a <form>). */
  formAction?: string;
  formMethod?: "GET" | "POST";
  /** hidden input name → value. Only hidden fields — never text/password/etc. */
  formFields?: Record<string, string>;
  /**
   * Safety gate for SSO auto-follow (ssoFollow.ts): true only if the form's *only* inputs
   * are hidden/submit — no text/password/email/etc., and no textarea/select. An <input>
   * with no `type` attribute defaults to "text" per the HTML spec, so it counts as unsafe,
   * not skipped. Auto-follow must check this before ever submitting anything.
   */
  onlyHiddenAndSubmitInputs?: boolean;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function formTargetHost(doc: Document, baseUrl: string): string | null {
  const action = doc.querySelector("form")?.getAttribute("action");
  if (!action) return safeHostname(baseUrl);
  const resolved = resolveUrl(action, baseUrl);
  return resolved ? safeHostname(resolved) : null;
}

function extractHiddenFields(form: Element): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const input of Array.from(
    form.querySelectorAll('input[type="hidden" i]'),
  )) {
    const name = input.getAttribute("name");
    if (name) fields[name] = input.getAttribute("value") ?? "";
  }
  return fields;
}

function onlyHiddenAndSubmitInputs(form: Element): boolean {
  if (form.querySelectorAll("textarea, select").length > 0) return false;
  return Array.from(form.querySelectorAll("input")).every((input) => {
    // No `type` attribute means the browser treats it as type="text" — unsafe, not skipped.
    const type = (input.getAttribute("type") || "text").toLowerCase();
    return type === "hidden" || type === "submit";
  });
}

function formDetails(
  form: Element,
  baseUrl: string,
): Pick<
  JsRedirectDetection,
  "formAction" | "formMethod" | "formFields" | "onlyHiddenAndSubmitInputs"
> {
  const action = form.getAttribute("action");
  const resolvedAction =
    (action ? resolveUrl(action, baseUrl) : baseUrl) ?? baseUrl;
  return {
    formAction: resolvedAction,
    formMethod:
      form.getAttribute("method")?.toUpperCase() === "POST" ? "POST" : "GET",
    formFields: extractHiddenFields(form),
    onlyHiddenAndSubmitInputs: onlyHiddenAndSubmitInputs(form),
  };
}

/**
 * Flags pages that hand off via JavaScript/SSO instead of a plain `<a href>` — a static
 * DOMParser crawl can't follow these, so they'd otherwise silently look like dead ends
 * (0 outgoing links) instead of "this needs a real browser to continue".
 *
 * Checks, in order: (1) `<meta http-equiv="refresh">` immediate redirect, (2) `<body onload>`
 * or an inline `<script>` calling `.submit()` on page load (the common SAML/CAS SSO pattern),
 * (3) zero `<a>` links with only a form pointing at a different host (a bare SSO POST form).
 */
export function detectJsRedirect(
  html: string,
  baseUrl: string,
): JsRedirectDetection | null {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const metaRefresh = doc.querySelector('meta[http-equiv="refresh" i]');
  if (metaRefresh) {
    const content = metaRefresh.getAttribute("content") ?? "";
    const match = /^\s*[\d.]*\s*;\s*url\s*=\s*(.+)$/i.exec(content);
    const rawTarget = match?.[1]?.trim().replace(/^["']|["']$/g, "");
    const resolved = rawTarget ? resolveUrl(rawTarget, baseUrl) : null;
    return {
      type: "meta-refresh",
      targetHost: resolved ? safeHostname(resolved) : null,
    };
  }

  const onloadAttr = doc.body?.getAttribute("onload") ?? "";
  const inlineScripts = Array.from(doc.querySelectorAll("script:not([src])"))
    .map((s) => s.textContent ?? "")
    .join("\n");
  const callsSubmitOnLoad =
    /\.submit\s*\(/.test(onloadAttr) ||
    (/\bonload\s*=|addEventListener\(\s*['"]load['"]/.test(inlineScripts) &&
      /\.submit\s*\(/.test(inlineScripts));
  if (callsSubmitOnLoad) {
    const targetHost = formTargetHost(doc, baseUrl);
    const form = doc.querySelector("form");
    if (!form) return { type: "form-submit", targetHost };
    return { type: "form-submit", targetHost, ...formDetails(form, baseUrl) };
  }

  const hasAnchors = doc.querySelector("a[href]") !== null;
  const formHost = formTargetHost(doc, baseUrl);
  if (!hasAnchors && formHost && formHost !== safeHostname(baseUrl)) {
    const form = doc.querySelector("form");
    if (!form) return { type: "no-links-external-form", targetHost: formHost };
    return {
      type: "no-links-external-form",
      targetHost: formHost,
      ...formDetails(form, baseUrl),
    };
  }

  return null;
}
