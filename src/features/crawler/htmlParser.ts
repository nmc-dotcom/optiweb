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
