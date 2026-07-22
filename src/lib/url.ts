/** Resolves a possibly-relative href against a base URL. Returns null if invalid. */
export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/**
 * Canonical string used as the BFS visited-set key: strips the fragment,
 * default ports, trailing slash (except root), and sorts query params so
 * `?b=2&a=1` and `?a=1&b=2` dedupe to the same entry.
 */
export function normalizeUrl(rawUrl: string): string {
  const u = new URL(rawUrl);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  const params = Array.from(u.searchParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

// Not a full Public Suffix List — just the handful of common two-label
// ccTLD suffixes (Korean ones especially, since that's this tool's primary
// audience) needed so "include subdomains" doesn't treat e.g. `co.kr` itself
// as the registrable domain for `example.co.kr`.
const KNOWN_TWO_LABEL_SUFFIXES = new Set([
  "co.kr",
  "or.kr",
  "go.kr",
  "ne.kr",
  "pe.kr",
  "re.kr",
  "ac.kr",
  "seoul.kr",
  "co.jp",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "co.nz",
  "com.cn",
  "com.br",
]);

export function getRegistrableDomain(hostname: string): string {
  const labels = hostname.split(".");
  if (labels.length <= 2) return hostname;
  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  if (KNOWN_TWO_LABEL_SUFFIXES.has(lastTwo)) return lastThree;
  return lastTwo;
}

/**
 * `includeSubdomains=false`: exact hostname match only.
 * `includeSubdomains=true`: matches the registrable domain and any of its subdomains
 * (e.g. starting at `www.example.com` also covers `blog.example.com`).
 */
export function isSameDomain(
  targetUrl: string,
  startHostname: string,
  includeSubdomains: boolean,
): boolean {
  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!includeSubdomains) return hostname === startHostname.toLowerCase();
  const root = getRegistrableDomain(startHostname.toLowerCase());
  return hostname === root || hostname.endsWith(`.${root}`);
}
