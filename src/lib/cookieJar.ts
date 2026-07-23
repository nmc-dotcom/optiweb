/**
 * In-memory cookie jar for the SSO auto-follow feature (src/features/crawler/ssoFollow.ts).
 *
 * Session-scoped only: never persisted (no localStorage/etc.), created fresh per crawl and
 * discarded on crawl start and crawl end (see useCrawlerStore.ts). Cookie *values* never
 * leave this module except joined into a `Cookie` header for outbound proxy requests — no
 * caller should ever render `entry.value` in the UI; only domains are surfaced upstream.
 * A future export feature (CSV/JSON/MD) must not include cookie values either.
 */

interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** No Domain attribute on the Set-Cookie → host-only, matched against the exact host only. */
  hostOnly: boolean;
}

export interface CookieJar {
  /** Parses and stores Set-Cookie headers seen for `requestUrl`. Returns the domain(s) touched. */
  store(requestUrl: string, setCookieHeaders: string[]): string[];
  /** `"name=value; name2=value2"` for cookies matching this URL's host+path, or `""`. */
  getCookieHeader(url: string): string;
  clear(): void;
}

function parseSetCookie(
  header: string,
  requestHost: string,
): CookieEntry | null {
  const parts = header.split(";").map((p) => p.trim());
  const first = parts[0];
  if (!first) return null;
  const eqIdx = first.indexOf("=");
  if (eqIdx === -1) return null;
  const name = first.slice(0, eqIdx).trim();
  const value = first.slice(eqIdx + 1).trim();
  if (!name) return null;

  let domain = requestHost.toLowerCase();
  let path = "/";
  let hostOnly = true;

  // Expiry/Secure/SameSite are intentionally ignored — matching semantics only, left to the
  // target server to enforce; only Domain/Path affect whether we send the cookie back.
  for (const attr of parts.slice(1)) {
    const eq = attr.indexOf("=");
    const key = (eq === -1 ? attr : attr.slice(0, eq)).trim().toLowerCase();
    const val = eq === -1 ? "" : attr.slice(eq + 1).trim();
    if (key === "domain" && val) {
      domain = val.toLowerCase().replace(/^\./, "");
      hostOnly = false;
    } else if (key === "path" && val) {
      path = val;
    }
  }

  return { name, value, domain, path, hostOnly };
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (cookiePath === "/" || requestPath === cookiePath) return true;
  const prefix = cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`;
  return requestPath.startsWith(prefix);
}

function domainMatches(requestHost: string, entry: CookieEntry): boolean {
  if (entry.hostOnly) return requestHost === entry.domain;
  return (
    requestHost === entry.domain || requestHost.endsWith(`.${entry.domain}`)
  );
}

export function createCookieJar(): CookieJar {
  let cookies: CookieEntry[] = [];

  return {
    store(requestUrl, setCookieHeaders) {
      let host: string;
      try {
        host = new URL(requestUrl).hostname.toLowerCase();
      } catch {
        return [];
      }

      const touchedDomains = new Set<string>();
      for (const header of setCookieHeaders) {
        const parsed = parseSetCookie(header, host);
        if (!parsed) continue;
        const idx = cookies.findIndex(
          (c) =>
            c.name === parsed.name &&
            c.domain === parsed.domain &&
            c.path === parsed.path,
        );
        if (idx >= 0) cookies[idx] = parsed;
        else cookies.push(parsed);
        touchedDomains.add(parsed.domain);
      }
      return [...touchedDomains];
    },

    getCookieHeader(url) {
      let host: string;
      let path: string;
      try {
        const parsed = new URL(url);
        host = parsed.hostname.toLowerCase();
        path = parsed.pathname || "/";
      } catch {
        return "";
      }
      return cookies
        .filter((c) => domainMatches(host, c) && pathMatches(path, c.path))
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
    },

    clear() {
      cookies = [];
    },
  };
}
