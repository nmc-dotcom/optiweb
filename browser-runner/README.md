# Optiweb browser runner

Dedicated Node.js service for read-only Chrome, Edge, and Naver Whale audits. It is
kept separate from Cloudflare Pages because Pages Functions cannot launch installed
desktop browsers.

## Safety boundary

- Requires a bearer token and accepts only the fixed `/v1/audit` schema.
- Rejects loopback, private, link-local, reserved, and unresolved target addresses.
- Allows only GET/HEAD network requests; POST/PUT/PATCH/DELETE are aborted.
- Blocks dangerous logout/delete/payment/admin-style paths.
- Blocks top-level navigation outside the registered host family.
- Does not click, type, submit forms, sign in, save, edit, or delete.
- Runs only one audit request at a time.
- The app sends at most 10 URLs per request. Browser families run in parallel, while
  URLs remain sequential within each browser to avoid request bursts against a site.

## Run

Install dependencies, set the token and paths for locally installed browsers, then start:

```sh
npm install
RUNNER_API_TOKEN=change-me \
CHROME_PATH=/usr/bin/google-chrome \
EDGE_PATH=/usr/bin/microsoft-edge \
WHALE_PATH=/usr/bin/naver-whale \
npm start
```

`CHROME_PATH` may be omitted when Chrome is installed in a standard location. The
runner also detects a Chrome for Testing binary in Playwright's Linux cache. Edge
and Whale are never substituted with Chrome: if their own binaries are absent,
their results remain `unavailable`.

Before starting the service, verify that the browsers can really launch in the
current Linux environment:

```sh
npm run diagnose
```

Authenticated `GET /health` reports an `installed` flag for each browser without
launching it or exposing its server filesystem path. Use the same bearer token as
`POST /v1/audit`. A real audit still returns `unavailable` if an installed executable
fails to launch.

## Container deployment

The container installs the matching Playwright Chromium build, Microsoft Edge, and
the official Naver Whale Linux package without modifying browsers on the host. It
runs as the image's unprivileged `pwuser`, drops Linux capabilities, uses a read-only
root filesystem, and binds only to loopback by default.

```sh
openssl rand -hex -out runner-token 32
# Register BROWSER_RUNNER_TOKEN in Pages from this file before changing ownership.
sudo chown 1001:1001 runner-token
sudo chmod 600 runner-token
docker compose -f compose.yaml build
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
```

Compose mounts `runner-token` as a read-only Docker secret. The token does not appear
in the container environment or Compose command history. The image's `pwuser` has
UID/GID `1001`, so the production token file is owned by that account and is not readable
by ordinary host users. `RUNNER_TOKEN_FILE` may point to another protected file when
needed; never commit that file.

When Wrangler is authenticated, register the token before `chown` without printing it:

```sh
npx wrangler pages secret put BROWSER_RUNNER_TOKEN --project-name optiweb < runner-token
```

Put an authenticated HTTPS reverse proxy or Cloudflare Tunnel in front of the local
port before configuring `BROWSER_RUNNER_URL`. The Compose host port defaults to `8790`
because `8788` is already occupied on the current server. Do not expose either port
directly.
The deployment network must also enforce an outbound deny rule for private,
loopback, link-local, and cloud metadata ranges; this is defense in depth against
DNS rebinding and cannot be guaranteed by application DNS checks alone.

`ARTIFACT_DIR` is optional. When set, viewport screenshots are stored there and only
their generated filenames are returned. Configure the Pages project with
`BROWSER_RUNNER_URL` and the matching secret `BROWSER_RUNNER_TOKEN`.

## Existing Cloudflare Tunnel on this server

The server's system tunnel reads `/etc/cloudflared/config.yml`. Merge the entry from
`cloudflared-ingress.example.yml` immediately before its final 404 catch-all, then create
the DNS route and restart `cloudflared`. Do not replace the existing ingress list: it also
serves `linkstart.ai.kr`, `mcp.linkstart.ai.kr`, and other applications.

Always pass `-f compose.yaml` (or its absolute path) on this host. Its shell environment
can otherwise select the parent `hermes-room` Compose project, which must remain separate.

Recommended public runner URL:

```text
https://browser-audit.linkstart.ai.kr
```

The public health and audit routes both require the bearer token. Cloudflare Pages calls
them through `functions/api/browser-audit.ts`; the browser receives only the same-origin
`/api/browser-audit` endpoint and never sees the runner URL or token.
