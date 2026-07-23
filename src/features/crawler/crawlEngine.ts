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
import {
  extractLinks,
  detectJsRedirect,
  type JsRedirectDetection,
} from "./htmlParser";
import { useCrawlerStore } from "./useCrawlerStore";
import { runRules } from "../rules/runRules";
import {
  runDuplicateRules,
  getTitleText,
  getMetaDescription,
} from "../rules/seo";
import type { RuleContext } from "../rules/types";
import { followSsoSession, type SsoOutcome } from "./ssoFollow";

let idCounter = 0;
function nextLinkId(): string {
  idCounter += 1;
  return `link-${idCounter}`;
}

const JS_REDIRECT_ISSUE = "JS/SSO 리다이렉트 — 정적 크롤링 불가";
const SSO_RESOLVED_ISSUE = "SSO 세션 확보 후 콘텐츠 로드 성공";
const SSO_FAILED_ISSUE = "SSO 자동 추적 실패";
const SSO_FAILED_SUFFIX = "— IP 바인딩 세션 또는 미지원 인증 흐름으로 추정";
const SSO_SKIPPED_ISSUE = "자격증명 입력 폼 감지 — 자동 추적 안 함 (보안 정책)";

function buildLinkResult(
  sourceUrl: string,
  targetUrl: string,
  resourceType: ResourceType,
  result: ProxyResponse,
  classification: StatusClassification,
  isExternal: boolean,
  jsRedirect?: JsRedirectDetection | null,
  ssoOutcome?: SsoOutcome | null,
): LinkResult {
  let issue = classification.issue;
  let severity = classification.severity;

  if (ssoOutcome) {
    if (ssoOutcome.kind === "resolved") {
      issue = `${SSO_RESOLVED_ISSUE} (${ssoOutcome.hops}홉)`;
      severity = "info";
    } else if (ssoOutcome.kind === "failed") {
      issue = `${SSO_FAILED_ISSUE} (${ssoOutcome.hops}홉 시도) ${SSO_FAILED_SUFFIX}`;
      severity = "warning";
    } else {
      issue = SSO_SKIPPED_ISSUE;
      severity = "info";
    }
  } else if (jsRedirect) {
    issue = jsRedirect.targetHost
      ? `${JS_REDIRECT_ISSUE} (${jsRedirect.targetHost})`
      : JS_REDIRECT_ISSUE;
    severity = "warning";
  }

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
    severity,
    issue,
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

    let result = await fetchProxy(item.url, {
      timeoutMs: config.timeoutMs,
      resourceType: "page",
    });
    if (config.ssoAutoFollow && result.setCookies.length > 0) {
      // The page itself (and any redirect hops the proxy already followed to reach it) can
      // set session-affinity cookies before SSO auto-follow even starts — capture those too,
      // not just cookies obtained inside followSsoSession's own POST hops.
      store.cookieJar.store(result.finalUrl, result.setCookies);
    }
    let classification = classify(
      result.status,
      result.errorType,
      result.redirectChain.length,
      result.isRedirectLoop,
    );
    const requiresAuth = result.status === 401 || result.status === 403;

    let isHtml = (result.contentType ?? "").toLowerCase().includes("text/html");
    let isSuccessful = result.status >= 200 && result.status < 300;
    let jsRedirect =
      isHtml && isSuccessful && result.bodyText
        ? detectJsRedirect(result.bodyText, result.finalUrl)
        : null;

    let ssoOutcome: SsoOutcome | null = null;
    if (config.ssoAutoFollow && jsRedirect?.type === "form-submit") {
      ssoOutcome = await followSsoSession(
        jsRedirect,
        item.url,
        store.cookieJar,
        config.timeoutMs,
      );
      if (ssoOutcome.kind === "resolved") {
        // Replace this page's own fetch with the SSO-resolved content — everything below
        // (PageResult, the single LinkResult row, link extraction, rule engine) then runs
        // exactly as it would for a normal page. This is what makes it "replace the row,
        // not add a new one": there was only ever one row-adding call site to begin with.
        result = ssoOutcome.result;
        classification = classify(
          result.status,
          result.errorType,
          result.redirectChain.length,
          result.isRedirectLoop,
        );
        isHtml = (result.contentType ?? "").toLowerCase().includes("text/html");
        isSuccessful = result.status >= 200 && result.status < 300;
        jsRedirect = null;
      }
    }

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
      ssoOutcome: ssoOutcome?.kind,
      ssoHops:
        ssoOutcome && ssoOutcome.kind !== "skipped-credentials"
          ? ssoOutcome.hops
          : undefined,
      ssoCookieDomains:
        ssoOutcome?.kind === "resolved" ? ssoOutcome.cookieDomains : undefined,
    });

    store.addLinkResult(
      buildLinkResult(
        item.sourceUrl ?? "",
        item.url,
        "page",
        result,
        classification,
        isExternal(item.url),
        jsRedirect,
        ssoOutcome,
      ),
    );

    const skipChildren = requiresAuth && config.excludeAuthPages;

    if (isHtml && isSuccessful && result.bodyText) {
      if (!skipChildren) {
        for (const link of extractLinks(result.bodyText, result.finalUrl)) {
          tryEnqueue({
            url: link.url,
            sourceUrl: item.url,
            depth: item.depth + 1,
            resourceType: link.resourceType,
          });
        }
      }

      // Own DOMParser pass, kept separate from extractLinks'/detectJsRedirect's parsing
      // above so the rule engine is purely additive and never touches their behavior.
      // Runs regardless of `skipChildren` — that only controls crawl expansion, this page
      // was still fetched successfully and should still be analyzed.
      const ruleDoc = new DOMParser().parseFromString(
        result.bodyText,
        "text/html",
      );
      const ruleContext: RuleContext = {
        doc: ruleDoc,
        url: result.finalUrl,
        html: result.bodyText,
        headers: {
          "content-type": result.contentType ?? "",
          "x-robots-tag": result.xRobotsTag ?? "",
        },
        siteIndex: useCrawlerStore.getState().siteIndex,
      };
      const issues = await runRules(ruleContext);
      store.addRuleIssues(item.url, issues);
      store.updateSiteIndex(
        item.url,
        getTitleText(ruleDoc),
        getMetaDescription(ruleDoc),
      );
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

  // SEO-DUP-TITLE/SEO-DUP-DESC can only run once the site index is complete —
  // see the comment on runDuplicateRules in features/rules/seo/duplicates.ts.
  for (const entry of runDuplicateRules(useCrawlerStore.getState().siteIndex)) {
    store.addRuleIssues(entry.pageUrl, [entry.issue]);
  }

  store.setStatus("done");
  // Discard any SSO session cookies now that the crawl is over — session-scoped only,
  // never persisted (see cookieJar.ts). reset() clears it again on the next crawl's start.
  store.cookieJar.clear();
}
