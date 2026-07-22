# Holorado Website Audit Tool

A website auditor (broken links / redirects / SEO / accessibility / web standards) that
crawls entirely from the browser and uses Cloudflare Pages Functions only as a thin,
single-URL proxy.

> **Status: Phase 1 (scaffold + core).** This pass implements the crawl engine, the proxy,
> and broken-link/redirect/status checks end-to-end. SEO checks, the accessibility rule
> engine (A1–A14), the web-standards rule engine (S1–S10), the Cytoscape link graph, orphan
> detection, and CSV/JSON/Markdown export are **not yet built** — see "What's next" below.

## Why the crawler lives in the browser, not the Function

Cloudflare Pages Functions on the free plan cap each invocation at **10ms CPU time** and
**50 external subrequests**. A traditional server-side crawler that BFS-walks an entire
site inside one Function call would blow through both limits on anything but a tiny site.

So the architecture inverts the usual "server crawls, browser displays" model:

```
┌─────────────────────────────┐         ┌──────────────────────────┐
│         Browser              │         │   Pages Function          │
│                               │         │   functions/api/fetch.ts  │
│  BFS queue, visited-set,      │  1 URL  │                            │
│  depth/page limits,           │────────▶│  1. Origin/Referer check   │
│  concurrency (worker-pool      │  per    │  2. SSRF guard on target   │
│  over a shared queue), retry,  │  call   │  3. fetch(url,             │
│  AbortController timeout       │◀────────│     redirect:'manual')     │
│                               │  JSON   │  4. step through redirects  │
│  DOMParser: extract links/     │         │     (re-validating SSRF    │
│  assets from the returned      │         │     on every hop)          │
│  HTML, classify status         │         │  5. cap body at 5MB,       │
│                               │         │     text types only        │
└─────────────────────────────┘         └──────────────────────────┘
```

- **The Function never parses HTML.** It fetches one URL, follows its redirect chain
  manually (so each hop can be re-checked against the SSRF guard), and returns status,
  headers, timing, and — for text-ish content types only — a capped response body as JSON.
- **The browser does everything else**: the BFS queue, the visited-URL set (with URL
  normalization for dedup), depth/page-count limits, bounded concurrency, retries with
  backoff, per-request timeouts, and all HTML parsing (via `DOMParser`) and rule checking.
- Result: Function call count scales ~1:1 with the number of distinct URLs discovered, not
  with the size of the crawl's internal bookkeeping — so a 100-page crawl makes roughly 100
  (plus assets) calls, comfortably inside the free daily quota.

## Guard layers in `functions/api/fetch.ts`

Two independent checks, in this order:

1. **Origin/Referer allowlist** — rejects (403) any request whose `Origin`/`Referer` isn't
   this same deployment's own origin (computed dynamically from the incoming request, so it
   works automatically across production/preview domains) or `http://localhost:*` for local
   dev. This stops third parties from calling the proxy directly from outside the app to
   burn the free-tier daily call quota — it has nothing to do with what URL is being
   fetched.
2. **SSRF guard on the target URL** — rejects (400) non-http(s) schemes and hostnames that
   are `localhost`, end in `.internal`/`.local`, or are IP literals in the private/link-local
   ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`,
   plus IPv6 loopback/link-local). This check runs again on **every redirect hop**, not just
   the initial URL, so a target site can't bounce the proxy into an internal address via a
   redirect. Since Workers can't pre-resolve DNS before `fetch()`, this is a hostname/IP-literal
   check, not full DNS-rebinding protection.

## Project structure

```
functions/api/fetch.ts       proxy: origin allowlist, SSRF guard, redirect stepping,
                              body-size cap, content-type whitelist

src/
  types/            shared contract types (CrawlConfig, ProxyResponse, LinkResult, ...)
  lib/
    url.ts            URL normalization, same-domain/subdomain matching
    fetchProxy.ts      client wrapper: calls /api/fetch, timeout + 1 retry on 429/5xx/network
    robotsTxt.ts        minimal robots.txt parser + fetch-and-parse helper
  features/
    crawler/
      crawlEngine.ts     BFS orchestration (worker-pool concurrency over a shared queue)
      htmlParser.ts       DOMParser-based link/asset extraction
      useCrawlerStore.ts  zustand store: queue/results/summary state
    checker/
      classifyStatus.ts   status-code bucketing, redirect/loop → severity + issue text
  components/         CrawlForm, ProgressBar, SummaryCards, ResultsTable, Layout
  i18n/               t() hook + ko.json/en.json (no hardcoded UI strings)
```

## Local development

```bash
npm install

# Terminal 1: the Pages Function (proxy), served on :8788
npm run build && npx wrangler pages dev dist --port 8788

# Terminal 2: Vite dev server — proxies /api/* to :8788 (see vite.config.ts)
npm run dev
```

Or build once and serve the whole app (including the Function) through Wrangler:

```bash
npm run pages:dev
```

## What's next (not in this phase)

- SEO checks (title/meta length, duplicate title/description, Open Graph, noindex)
- Accessibility rule engine (A1–A14) with WCAG/KWCAG citations
- Web standards rule engine (S1–S10: DOCTYPE, deprecated tags/attrs, mixed content, ...)
- Cytoscape.js link graph, orphan-page detection via sitemap.xml
- CSV / JSON / Markdown export
- Web Worker offloading for the heavier rule engines
- PWA (manifest, service worker, offline result history)
