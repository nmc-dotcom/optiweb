# Holorado Website Audit Tool

A website auditor (broken links / redirects / SEO / accessibility / web standards) that
crawls entirely from the browser and uses Cloudflare Pages Functions only as a thin,
single-URL proxy.

> **Status: Phase 3 (SSO session bootstrap auto-follow).** Phase 1 (crawl engine, proxy),
> Phase 1.5 (JS/SSO redirect detection), and Phase 2 (SEO/A11y/Standards rule engines) are
> done. This pass adds an opt-in auto-follow of the specific "anonymous SSO session
> bootstrap" pattern Phase 1.5 could only warn about. The Cytoscape link graph, orphan-page
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

## Rule engine: SEO / A11y / Standards

Every rule implements one interface (`src/features/rules/types.ts`):

```ts
interface Rule {
  id: string;
  category: "seo" | "a11y" | "standards";
  severity: "error" | "warning" | "info";
  wcag?: string;
  kwcag?: string;
  check(ctx: RuleContext): Issue[]; // ctx = { doc, url, html, headers, siteIndex }
}
```

One rule = one file (`src/features/rules/{seo,a11y,standards}/*.ts`), each folder's
`index.ts` exporting the category's `Rule[]`. Adding a rule is adding a file plus one line
in that `index.ts` — no other code changes. `runRules.ts` runs the full list against a
page and isolates each rule in its own try/catch, so one throwing rule can't take down the
rest of the pass.

`SEO-DUP-TITLE`/`SEO-DUP-DESC` are the one exception: they can't run per-page like every
other rule because "is this a duplicate" isn't knowable until every page has been crawled.
They live in `seo/duplicates.ts` as a small standalone function `runCrawl` calls once after
the crawl finishes, walking the completed `SiteIndex` (title/description → URLs, built up
incrementally in `useCrawlerStore` as each page is crawled) and emitting an issue on every
page that shares a title/description with another page.

**Why `requestIdleCallback` chunking, not a Web Worker.** Workers have no `DOMParser` (no
DOM at all), and a parsed `Document` can't cross `postMessage`. Making the rule engine run
in a Worker would mean either shipping a second, string/regex-only implementation of every
rule that needs real DOM traversal — which is most of them, and breaks the "one rule = one
file, one interface" design this phase is built around — or bundling an HTML-parsing
library into the Worker just to reconstruct a DOM there. Neither is worth it for pure
business-logic rules. Instead, `runRules.ts` chunks the ~30-rule list a few rules at a time
across `requestIdleCallback` slices (falling back to a macrotask `setTimeout` on browsers
without it, e.g. Safari), so a page's full rule pass never runs as one long synchronous
block — combined with the crawler already `await`-ing network I/O between pages, the
progress UI stays responsive through 100+ page crawls.

**Table unification without touching existing types.** Rule findings are stored as a
separate `ruleIssues: { pageUrl, issue }[]` array in `useCrawlerStore` (alongside the
existing `linkResults`) — `LinkResult`/`PageResult` aren't changed at all. `ResultsTable`
merges both arrays into one row shape at render time via `useMemo`, so link checks and
SEO/A11y/Standards findings show up in the same filterable/sortable table.

## SSO session bootstrap auto-follow

Phase 1.5's `detectJsRedirect()` flags pages that hand off via an auto-submitting form to
another host — the SAML/CAS "SSO relay" pattern. Real target case:
`https://aac.uos.ac.kr/` auto-POSTs a hidden-field form to `sso.uos.ac.kr` on load,
apparently to bootstrap an anonymous session cookie (no credentials involved). This is an
**opt-in** (default off) attempt to follow that specific pattern through to real content.

**Real, stated-up-front unknown**: Cloudflare Workers may originate each subrequest from a
different IP. If the target binds the session to the requesting IP, a cookie obtained on
one `/api/fetch` call can be rejected on the next — this can't be known without testing.
Both a clean "resolved" and a clean, correctly-diagnosed "failed" are a working outcome for
this feature; "always succeeds" was never the goal.

**Non-negotiable safety rules**, enforced in `htmlParser.ts`'s `onlyHiddenAndSubmitInputs()`
and checked before anything else in `ssoFollow.ts`:

- A form is only ever auto-submitted if _every_ input is `type="hidden"` or `type="submit"`
  and it contains no `<textarea>`/`<select>`. An `<input>` with no `type` attribute defaults
  to `text` per the HTML spec — treated as unsafe, not skipped. Anything else →
  `skipped-credentials`, no network call at all.
- Off by default — the "SSO 자동 세션 추적" checkbox in `CrawlForm.tsx` must be enabled.
- Cookie **values** are never rendered anywhere — `PageDetailModal` shows only the domain(s)
  touched, masked as `domain: ***`. `cookieJar.ts`'s values never leave that module except
  joined into an outbound `Cookie` header.
- Cookies are in-memory only for the active crawl (`useCrawlerStore`'s `cookieJar` instance)
  — no `localStorage`, cleared on crawl start (`reset()`) and crawl end (`crawlEngine.ts`).
- **Export isn't built yet, but when it is: it must never include cookie values.** Flagging
  this now since there's no export code yet to enforce it against.

Flow (`src/features/crawler/ssoFollow.ts`): POST the hidden fields via a new
`onRequestPost` handler in `functions/api/fetch.ts` (a JSON body, not query params — a
`SAMLRequest` hidden field can be several KB), read `Set-Cookie` via
`response.headers.getSetCookie()` (plain `.get()` collapses multiple cookies into one
string) into the cookie jar, then check the response: if it's real HTML content (not
another `form-submit` pattern), also retry the _originally requested_ page with the new
cookies (many SSO relays never redirect back themselves — the real destination is often
only implied by a `RelayState`-style hidden field) and prefer that if it also resolves.
Otherwise recurse into the next form, up to 3 hops, only ever on another `form-submit`
pattern (a `meta-refresh` or credentialed form mid-chain stops the flow). In
`crawlEngine.ts`, a `'resolved'` outcome **replaces** the page's own fetch result in place
before the single `addPageResult`/`addLinkResult` call — there's only ever one row-adding
call site for a page, so this is what makes it "replace the row, don't add a new one," and
lets link extraction/rule-engine execution continue against the resolved content exactly as
if it had been the original response. The intermediate SSO host is never crawled as its own
node.

## Project structure

```
functions/api/fetch.ts       proxy: origin allowlist, SSRF guard, redirect stepping,
                              body-size cap, content-type whitelist;
                              onRequestPost — POST+cookie variant for SSO auto-follow

src/
  types/            shared contract types (CrawlConfig, ProxyResponse, LinkResult, ...)
  lib/
    url.ts            URL normalization, same-domain/subdomain matching
    fetchProxy.ts      client wrapper: calls /api/fetch (GET or POST), timeout + 1 retry
    robotsTxt.ts        minimal robots.txt parser + fetch-and-parse helper
    severityStyle.ts    shared severity → badge class mapping (table + detail modal)
    cookieJar.ts        in-memory Set-Cookie jar for SSO auto-follow — session-scoped only
  features/
    crawler/
      crawlEngine.ts     BFS orchestration (worker-pool concurrency over a shared queue),
                         also runs the per-page rule pass, the post-crawl duplicate pass,
                         and SSO auto-follow when enabled
      htmlParser.ts       DOMParser-based link/asset extraction, JS/SSO redirect detection
                         (formAction/formFields/onlyHiddenAndSubmitInputs for SSO auto-follow)
      ssoFollow.ts        auto-follow logic for the SSO session-bootstrap pattern
      useCrawlerStore.ts  zustand store: queue/results/ruleIssues/siteIndex/cookieJar state
    checker/
      classifyStatus.ts   status-code bucketing, redirect/loop → severity + issue text
    rules/
      types.ts            Rule/Issue/RuleContext/SiteIndex + elementSnippet/collapseIssues
      runRules.ts          per-page runner: try/catch isolation + idle-callback chunking
      seo/, a11y/, standards/   one file per rule + index.ts exporting that category's Rule[]
  components/         CrawlForm, ProgressBar, SummaryCards, ResultsTable, PageDetailModal, Layout
  i18n/               t() hook + ko.json/en.json (no hardcoded UI strings, incl. rule messages)
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

- Cytoscape.js link graph, orphan-page detection via sitemap.xml
- CSV / JSON / Markdown export
- PWA (manifest, service worker, offline result history)
