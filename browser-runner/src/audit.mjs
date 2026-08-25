import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  assertPublicUrl,
  isSafeReadOnlyUrl,
  isSameHostFamily,
} from "./safety.mjs";

const SYSTEM_EXECUTABLES = {
  chrome: [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/opt/google/chrome/chrome",
  ],
  edge: [
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/microsoft-edge",
    "/opt/microsoft/msedge/msedge",
  ],
  whale: [
    "/usr/bin/naver-whale-stable",
    "/usr/bin/naver-whale",
    "/opt/naver/whale/whale",
  ],
};

const ENV_PATHS = {
  chrome: "CHROME_PATH",
  edge: "EDGE_PATH",
  whale: "WHALE_PATH",
};

export function findPlaywrightChrome(cacheRoot) {
  const resolvedCacheRoot =
    cacheRoot ??
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    path.join(homedir(), ".cache", "ms-playwright");
  try {
    const revisions = readdirSync(resolvedCacheRoot, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name),
      )
      .sort((left, right) =>
        right.name.localeCompare(left.name, undefined, { numeric: true }),
      );
    for (const revision of revisions) {
      for (const relativePath of [
        ["chrome-linux64", "chrome"],
        ["chrome-linux", "chrome"],
      ]) {
        const candidate = path.join(
          resolvedCacheRoot,
          revision.name,
          ...relativePath,
        );
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // An absent or unreadable cache is equivalent to no cached browser.
  }
  return undefined;
}

export function executableFor(browser) {
  const envPath = process.env[ENV_PATHS[browser]];
  const candidates = [
    envPath,
    ...(SYSTEM_EXECUTABLES[browser] ?? []),
    browser === "chrome" ? findPlaywrightChrome() : undefined,
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

export function browserCapabilities() {
  return ["chrome", "edge", "whale"].map((browser) => ({
    browser,
    installed: Boolean(executableFor(browser)),
  }));
}

export async function diagnoseBrowsers() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return ["chrome", "edge", "whale"].map((browser) => ({
      browser,
      available: false,
      reason: "playwright_core_not_installed",
    }));
  }

  return Promise.all(
    ["chrome", "edge", "whale"].map(async (browser) => {
      const executablePath = executableFor(browser);
      if (!executablePath)
        return { browser, available: false, reason: "browser_not_installed" };
      let instance;
      try {
        instance = await chromium.launch({
          executablePath,
          headless: true,
          args: ["--disable-background-networking", "--disable-sync"],
        });
        return { browser, available: true, version: instance.version() };
      } catch (error) {
        return {
          browser,
          available: false,
          reason:
            error instanceof Error
              ? `browser_launch_failed: ${error.message}`
              : "browser_launch_failed",
        };
      } finally {
        await instance?.close().catch(() => undefined);
      }
    }),
  );
}

function unavailable(url, browser, reason) {
  return {
    url,
    browser,
    functionalStatus: "unavailable",
    visualStatus: "unavailable",
    issues: [],
    viewports: [],
    durationMs: 0,
    checkedAt: Date.now(),
    unavailableReason: reason,
  };
}

function addIssue(issues, issue) {
  const key = `${issue.kind}:${issue.viewport ?? ""}:${issue.url ?? ""}:${issue.message}`;
  if (!issues.some((current) => current._key === key))
    issues.push({ ...issue, _key: key });
}

async function visualMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.max(
      root?.scrollWidth ?? 0,
      body?.scrollWidth ?? 0,
    );
    const candidates = document.querySelectorAll(
      "button,input,select,textarea,img,video,iframe,table,pre,[role='button']",
    );
    let clippedElementCount = 0;
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (
        rect.width <= 1 ||
        rect.height <= 1 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      )
        continue;
      const outsideViewport = rect.left < -1 || rect.right > viewportWidth + 1;
      const clippedInside =
        element.scrollWidth > element.clientWidth + 1 &&
        ["hidden", "clip"].includes(style.overflowX);
      if (outsideViewport || clippedInside) clippedElementCount += 1;
    }
    return {
      horizontalOverflowPx: Math.max(0, documentWidth - viewportWidth),
      clippedElementCount,
    };
  });
}

async function screenshot(page, browser, url, viewport) {
  const directory = process.env.ARTIFACT_DIR;
  if (!directory) return undefined;
  await mkdir(directory, { recursive: true });
  const id = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const filename = `${browser}-${id}-${viewport.name}.png`;
  await page.screenshot({
    path: path.join(directory, filename),
    fullPage: true,
    animations: "disabled",
  });
  return filename;
}

async function auditPage(browser, browserName, browserVersion, url, viewports) {
  const startedAt = Date.now();
  const checkedUrl = await assertPublicUrl(url);
  const registeredHost = checkedUrl.hostname;
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: viewports[0].width, height: viewports[0].height },
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  const publicHostCache = new Map();
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method()))
      return route.abort("blockedbyclient");
    const requestUrl = request.url();
    if (!isSafeReadOnlyUrl(requestUrl)) return route.abort("blockedbyclient");
    try {
      const parsed = new URL(requestUrl);
      if (
        request.isNavigationRequest() &&
        !isSameHostFamily(parsed.hostname, registeredHost)
      )
        return route.abort("blockedbyclient");
      let validation = publicHostCache.get(parsed.hostname);
      if (!validation) {
        validation = assertPublicUrl(requestUrl);
        publicHostCache.set(parsed.hostname, validation);
      }
      await validation;
      return route.continue();
    } catch {
      return route.abort("blockedbyclient");
    }
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error")
      addIssue(issues, {
        kind: "console-error",
        message: message.text().slice(0, 1_000),
      });
  });
  page.on("pageerror", (error) =>
    addIssue(issues, {
      kind: "javascript-error",
      message: error.message.slice(0, 1_000),
    }),
  );
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText === "net::ERR_BLOCKED_BY_CLIENT") return;
    addIssue(issues, {
      kind: "resource-failure",
      message: request.failure()?.errorText ?? "resource request failed",
      url: request.url().slice(0, 2_048),
    });
  });
  page.on("request", (request) => {
    if (checkedUrl.protocol === "https:" && request.url().startsWith("http:"))
      addIssue(issues, {
        kind: "mixed-content",
        message: "HTTPS page requested an HTTP resource",
        url: request.url().slice(0, 2_048),
      });
  });
  page.on("popup", async (popup) => {
    addIssue(issues, {
      kind: "popup-blocked",
      message: "Page attempted to open a popup",
    });
    await popup.close().catch(() => undefined);
  });
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));

  let navigationSucceeded = true;
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: Number(process.env.PAGE_TIMEOUT_MS ?? 15_000),
    });
    await page.waitForTimeout(300);
  } catch (error) {
    navigationSucceeded = false;
    addIssue(issues, {
      kind: "navigation-error",
      message:
        error instanceof Error
          ? error.message.slice(0, 1_000)
          : "navigation failed",
    });
  }

  const viewportResults = [];
  if (navigationSucceeded) {
    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.waitForTimeout(150);
      const metrics = await visualMetrics(page);
      const screenshotPath = await screenshot(
        page,
        browserName,
        url,
        viewport,
      ).catch(() => undefined);
      viewportResults.push({ ...viewport, ...metrics, screenshotPath });
      if (metrics.horizontalOverflowPx > 1)
        addIssue(issues, {
          kind: "horizontal-overflow",
          viewport: viewport.name,
          message: `Document exceeds viewport by ${metrics.horizontalOverflowPx}px`,
        });
      if (metrics.clippedElementCount > 0)
        addIssue(issues, {
          kind: "clipped-content",
          viewport: viewport.name,
          message: `${metrics.clippedElementCount} visible element(s) are clipped or outside the viewport`,
        });
    }
  }
  await context.close();

  const cleanIssues = issues.map(({ _key, ...issue }) => issue);
  const functionalKinds = new Set([
    "console-error",
    "javascript-error",
    "resource-failure",
    "mixed-content",
    "popup-blocked",
    "navigation-error",
  ]);
  const visualKinds = new Set(["horizontal-overflow", "clipped-content"]);
  return {
    url,
    browser: browserName,
    browserVersion,
    functionalStatus: cleanIssues.some((issue) =>
      functionalKinds.has(issue.kind),
    )
      ? "fail"
      : "pass",
    visualStatus: navigationSucceeded
      ? cleanIssues.some((issue) => visualKinds.has(issue.kind))
        ? "fail"
        : "pass"
      : "unavailable",
    issues: cleanIssues,
    viewports: viewportResults,
    durationMs: Date.now() - startedAt,
    checkedAt: Date.now(),
  };
}

export async function runAudit({ urls, browsers, viewports }) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return {
      results: browsers.flatMap((browser) =>
        urls.map((url) =>
          unavailable(url, browser, "playwright_core_not_installed"),
        ),
      ),
    };
  }

  async function auditBrowser(browserName) {
    const results = [];
    const executablePath = executableFor(browserName);
    if (!executablePath) {
      return urls.map((url) =>
        unavailable(url, browserName, "browser_not_installed"),
      );
    }
    let browser;
    let browserServer;
    try {
      const launchOptions = {
        executablePath,
        headless: true,
        args: ["--disable-background-networking", "--disable-sync"],
      };
      // Whale does not acknowledge Playwright's graceful Browser.close command
      // and waits for Playwright's 30-second forced-close timeout. Running it as
      // a BrowserServer lets us terminate the isolated child immediately after
      // all read-only checks have completed.
      if (browserName === "whale") {
        browserServer = await chromium.launchServer(launchOptions);
        browser = await chromium.connect(browserServer.wsEndpoint());
      } else {
        browser = await chromium.launch(launchOptions);
      }
      const version = browser.version();
      for (const url of urls) {
        try {
          results.push(
            await auditPage(browser, browserName, version, url, viewports),
          );
        } catch (error) {
          results.push(
            unavailable(
              url,
              browserName,
              error instanceof Error ? error.message : "audit_failed",
            ),
          );
        }
      }
    } catch (error) {
      results.push(
        ...urls.map((url) =>
          unavailable(
            url,
            browserName,
            error instanceof Error ? error.message : "browser_launch_failed",
          ),
        ),
      );
    } finally {
      if (browserServer) {
        await browserServer.kill().catch(() => undefined);
      } else {
        await browser?.close().catch(() => undefined);
      }
    }
    return results;
  }

  // Browser families run independently, while URLs stay sequential inside each
  // browser to avoid sending a burst of page loads to the audited site.
  const groupedResults = await Promise.all(browsers.map(auditBrowser));
  return { results: groupedResults.flat() };
}
