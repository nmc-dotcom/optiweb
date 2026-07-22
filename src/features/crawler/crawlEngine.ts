import type {
  CrawlConfig,
  LinkResult,
  ProxyResponse,
  QueueItem,
  ResourceType,
} from "../../types";
import { fetchProxy } from "../../lib/fetchProxy";
import { normalizeUrl, isSameDomain } from "../../lib/url";
import {
  fetchRobotsRules,
  isPathAllowed,
  type RobotsRules,
} from "../../lib/robotsTxt";
import { classify, type StatusClassification } from "../checker/classifyStatus";
import { extractLinks } from "./htmlParser";
import { useCrawlerStore } from "./useCrawlerStore";

let idCounter = 0;
function nextLinkId(): string {
  idCounter += 1;
  return `link-${idCounter}`;
}

function buildLinkResult(
  sourceUrl: string,
  targetUrl: string,
  resourceType: ResourceType,
  result: ProxyResponse,
  classification: StatusClassification,
  isExternal: boolean,
): LinkResult {
  return {
    id: nextLinkId(),
    sourceUrl,
    targetUrl,
    resourceType,
    status: result.status,
    errorType: result.errorType,
    redirectChain: result.redirectChain,
    isRedirectLoop: result.isRedirectLoop,
    responseTimeMs: result.responseTimeMs,
    isExternal,
    isBroken: classification.isBroken,
    category: "link",
    severity: classification.severity,
    issue: classification.issue,
  };
}

/**
 * Client-side BFS crawl orchestration. Runs entirely in the browser: the proxy
 * (`/api/fetch`) only fetches one URL at a time, all queueing/parsing/checks happen
 * here so Cloudflare's free-tier CPU-per-invocation limit is never hit.
 */
export async function runCrawl(config: CrawlConfig): Promise<void> {
  const store = useCrawlerStore.getState();
  store.reset();
  store.setConfig(config);
  store.setStatus("running");

  const startHostname = new URL(config.startUrl).hostname;
  const startOrigin = new URL(config.startUrl).origin;
  const isExternal = (url: string) =>
    !isSameDomain(url, startHostname, config.includeSubdomains);

  const robotsRules: RobotsRules = config.respectRobotsTxt
    ? await fetchRobotsRules(startOrigin, config.timeoutMs)
    : { rules: [] };

  const visited = new Set<string>();
  const queue: QueueItem[] = [];
  let pageCount = 0;
  let processedCount = 0;
  let activeWorkers = 0;

  function tryEnqueue(item: QueueItem): void {
    let normalized: string;
    try {
      normalized = normalizeUrl(item.url);
    } catch {
      return;
    }
    if (visited.has(normalized)) return;

    if (item.resourceType === "page") {
      if (item.depth > config.maxDepth) return;
      if (config.sameDomainOnly && isExternal(item.url)) return;
      if (pageCount >= config.maxPages) return;
      pageCount += 1;
    }

    visited.add(normalized);
    queue.push(item);
  }

  tryEnqueue({
    url: config.startUrl,
    sourceUrl: null,
    depth: 0,
    resourceType: "page",
  });

  async function handlePage(item: QueueItem): Promise<void> {
    const blockedByRobots =
      config.respectRobotsTxt &&
      !isPathAllowed(new URL(item.url).pathname, robotsRules);

    if (blockedByRobots) {
      store.addPageResult({
        url: item.url,
        depth: item.depth,
        status: 0,
        redirectChain: [],
        isRedirectLoop: false,
        responseTimeMs: 0,
        requiresAuth: false,
        blockedByRobots: true,
        discoveredAt: Date.now(),
      });
      return;
    }

    const result = await fetchProxy(item.url, {
      timeoutMs: config.timeoutMs,
      resourceType: "page",
    });
    const classification = classify(
      result.status,
      result.errorType,
      result.redirectChain.length,
      result.isRedirectLoop,
    );
    const requiresAuth = result.status === 401 || result.status === 403;

    store.addPageResult({
      url: item.url,
      depth: item.depth,
      status: result.status,
      errorType: result.errorType,
      redirectChain: result.redirectChain,
      isRedirectLoop: result.isRedirectLoop,
      responseTimeMs: result.responseTimeMs,
      requiresAuth,
      blockedByRobots: false,
      discoveredAt: Date.now(),
    });

    store.addLinkResult(
      buildLinkResult(
        item.sourceUrl ?? "",
        item.url,
        "page",
        result,
        classification,
        isExternal(item.url),
      ),
    );

    const skipChildren = requiresAuth && config.excludeAuthPages;
    const isHtml = (result.contentType ?? "")
      .toLowerCase()
      .includes("text/html");
    const isSuccessful = result.status >= 200 && result.status < 300;

    if (!skipChildren && isHtml && isSuccessful && result.bodyText) {
      for (const link of extractLinks(result.bodyText, result.finalUrl)) {
        tryEnqueue({
          url: link.url,
          sourceUrl: item.url,
          depth: item.depth + 1,
          resourceType: link.resourceType,
        });
      }
    }
  }

  async function handleAsset(item: QueueItem): Promise<void> {
    const result = await fetchProxy(item.url, {
      timeoutMs: config.timeoutMs,
      resourceType: item.resourceType,
    });
    const classification = classify(
      result.status,
      result.errorType,
      result.redirectChain.length,
      result.isRedirectLoop,
    );
    if (item.sourceUrl) {
      store.addLinkResult(
        buildLinkResult(
          item.sourceUrl,
          item.url,
          item.resourceType,
          result,
          classification,
          isExternal(item.url),
        ),
      );
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const item = queue.shift();
      if (!item) {
        if (activeWorkers === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      activeWorkers += 1;
      try {
        if (item.resourceType === "page") {
          await handlePage(item);
        } else {
          await handleAsset(item);
        }
      } finally {
        activeWorkers -= 1;
        processedCount += 1;
        store.setProgress(queue.length, processedCount);
      }
    }
  }

  const workerCount = Math.max(1, config.concurrency);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  store.setStatus("done");
}
