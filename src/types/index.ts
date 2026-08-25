export type ProxyErrorType =
  | "timeout"
  | "dns"
  | "network"
  | "ssrf_blocked"
  | "origin_blocked"
  | "too_many_redirects"
  | "response_too_large";

export interface RedirectHop {
  url: string;
  status: number;
}

/** Contract returned by the `/api/fetch` Pages Function proxy. */
export interface ProxyResponse {
  requestedUrl: string;
  finalUrl: string;
  /** 0 when the request never got an HTTP response (timeout/dns/network/blocked). */
  status: number;
  statusText: string;
  redirectChain: RedirectHop[];
  isRedirectLoop: boolean;
  contentType: string | null;
  xRobotsTag: string | null;
  /** Present only for text-ish content types (html/css/js/xml/json). */
  bodyText?: string;
  bodyTruncated: boolean;
  responseTimeMs: number;
  errorType?: ProxyErrorType;
  /** Raw Set-Cookie headers seen across every hop of this call. Always present (possibly empty). */
  setCookies: string[];
}

export type ResourceType =
  "page" | "image" | "css" | "js" | "iframe" | "pdf" | "other";

export interface CrawlConfig {
  startUrl: string;
  /** Optional user-provided URL list from textarea/CSV/XLSX. */
  manualUrls: string[];
  /** When true, checks only manualUrls and does not expand discovered links/assets. */
  manualOnly: boolean;
  sameDomainOnly: boolean;
  includeSubdomains: boolean;
  /** Default 100, hard cap 500 (free-tier quota protection). */
  maxPages: number;
  /** Default 3. */
  maxDepth: number;
  /** Default 10000. */
  timeoutMs: number;
  /** Default 4. */
  concurrency: number;
  respectRobotsTxt: boolean;
  excludeAuthPages: boolean;
  /** Experimental, default off — auto-submits hidden-only SSO bootstrap forms. See ssoFollow.ts. */
  ssoAutoFollow: boolean;
  /** Default on — checks through the official W3C validators. */
  w3cValidation: boolean;
  /** Default on — requests a read-only audit from the separately deployed browser runner. */
  browserCompatibility: boolean;
}

export const DEFAULT_CRAWL_CONFIG: Omit<CrawlConfig, "startUrl"> = {
  manualUrls: [],
  manualOnly: false,
  sameDomainOnly: true,
  includeSubdomains: false,
  maxPages: 100,
  maxDepth: 3,
  timeoutMs: 10_000,
  concurrency: 4,
  respectRobotsTxt: true,
  excludeAuthPages: true,
  ssoAutoFollow: false,
  w3cValidation: true,
  browserCompatibility: true,
};

export const MAX_PAGES_LIMIT = 500;

export type IssueSeverity = "error" | "warning" | "info";
export type IssueCategory = "link" | "seo" | "a11y" | "standards";

export interface LinkResult {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  resourceType: ResourceType;
  status: number;
  errorType?: ProxyErrorType;
  redirectChain: RedirectHop[];
  isRedirectLoop: boolean;
  responseTimeMs: number;
  isExternal: boolean;
  isBroken: boolean;
  category: IssueCategory;
  severity: IssueSeverity;
  issue: string;
}

export type SsoOutcomeKind = "resolved" | "failed" | "skipped-credentials";

export interface PageResult {
  url: string;
  depth: number;
  status: number;
  errorType?: ProxyErrorType;
  redirectChain: RedirectHop[];
  isRedirectLoop: boolean;
  responseTimeMs: number;
  requiresAuth: boolean;
  blockedByRobots: boolean;
  discoveredAt: number;
  ssoOutcome?: SsoOutcomeKind;
  ssoHops?: number;
  /** Cookie *domains* touched during SSO follow — never values. */
  ssoCookieDomains?: string[];
}

export interface CrawlSummary {
  pagesScanned: number;
  brokenLinks: number;
  redirects: number;
  brokenImages: number;
  seoWarnings: number;
  a11yIssues: number;
  standardsIssues: number;
}

export type CrawlStatus = "idle" | "running" | "done" | "error";

export type BrowserName = "chrome" | "edge" | "whale";
export type BrowserAuditStatus = "pass" | "fail" | "unavailable";
export type BrowserAuditRunStatus = "idle" | "running" | "done" | "unavailable";
export interface BrowserAuditProgress {
  completed: number;
  total: number;
}
export type BrowserIssueKind =
  | "console-error"
  | "javascript-error"
  | "resource-failure"
  | "mixed-content"
  | "popup-blocked"
  | "horizontal-overflow"
  | "clipped-content"
  | "navigation-error";

export interface BrowserViewportResult {
  name: "desktop" | "tablet" | "mobile";
  width: number;
  height: number;
  horizontalOverflowPx: number;
  clippedElementCount: number;
  screenshotPath?: string;
}

export interface BrowserAuditIssue {
  kind: BrowserIssueKind;
  message: string;
  viewport?: BrowserViewportResult["name"];
  url?: string;
}

export interface BrowserAuditResult {
  url: string;
  browser: BrowserName;
  browserVersion?: string;
  functionalStatus: BrowserAuditStatus;
  visualStatus: BrowserAuditStatus;
  issues: BrowserAuditIssue[];
  viewports: BrowserViewportResult[];
  durationMs: number;
  checkedAt: number;
  unavailableReason?: string;
}

export interface QueueItem {
  url: string;
  sourceUrl: string | null;
  depth: number;
  resourceType: ResourceType;
}
