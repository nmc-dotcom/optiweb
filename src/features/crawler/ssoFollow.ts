import { fetchProxy } from "../../lib/fetchProxy";
import type { CookieJar } from "../../lib/cookieJar";
import { detectJsRedirect, type JsRedirectDetection } from "./htmlParser";
import type { ProxyResponse } from "../../types";

const MAX_HOPS = 3;

export type SsoOutcome =
  | {
      kind: "resolved";
      hops: number;
      result: ProxyResponse;
      cookieDomains: string[];
    }
  | { kind: "failed"; hops: number; reason: string }
  | { kind: "skipped-credentials" };

function isRealContent(result: ProxyResponse): boolean {
  if (!result.bodyText) return false;
  if (!(result.contentType ?? "").toLowerCase().includes("text/html"))
    return false;
  return detectJsRedirect(result.bodyText, result.finalUrl) === null;
}

/**
 * Auto-follows a detected SSO session-bootstrap form — Phase 1.5's `form-submit` pattern
 * only (never `no-links-external-form`/`meta-refresh`; the spec's recursion only re-triggers
 * on another `form-submit`) — up to `MAX_HOPS` times.
 *
 * `onlyHiddenAndSubmitInputs` is checked first, unconditionally, before anything else in
 * this function runs — this is the fail-closed credential-safety gate. Every recursive step
 * re-checks it again on the *next* form too, so a credentialed form appearing mid-chain
 * still stops the flow rather than being submitted.
 */
export async function followSsoSession(
  detection: JsRedirectDetection,
  pageUrl: string,
  cookieJar: CookieJar,
  timeoutMs: number,
): Promise<SsoOutcome> {
  if (!detection.onlyHiddenAndSubmitInputs) {
    return { kind: "skipped-credentials" };
  }
  if (!detection.formAction) {
    return { kind: "failed", hops: 0, reason: "no form action to submit to" };
  }

  let currentUrl = detection.formAction;
  let currentFields = detection.formFields ?? {};
  let currentMethod: "GET" | "POST" = detection.formMethod ?? "POST";
  const cookieDomains = new Set<string>();
  let hops = 0;

  while (hops < MAX_HOPS) {
    hops += 1;
    const body =
      currentMethod === "POST"
        ? new URLSearchParams(currentFields).toString()
        : undefined;
    const cookieHeader = cookieJar.getCookieHeader(currentUrl);

    const result = await fetchProxy(currentUrl, {
      timeoutMs,
      method: currentMethod,
      body,
      cookie: cookieHeader || undefined,
    });

    if (result.setCookies.length > 0) {
      for (const domain of cookieJar.store(result.finalUrl, result.setCookies))
        cookieDomains.add(domain);
    }

    if (result.status < 200 || result.status >= 300) {
      return {
        kind: "failed",
        hops,
        reason: `non-2xx response (status ${result.status})`,
      };
    }

    if (isRealContent(result)) {
      // Many SSO relays don't redirect back to the originally requested page themselves —
      // the real destination is often only implied by a RelayState-style hidden field — so
      // also retry the original URL with the now-established cookies, and prefer it if it
      // also looks like real content.
      const retryOriginal = await fetchProxy(pageUrl, {
        timeoutMs,
        cookie: cookieJar.getCookieHeader(pageUrl) || undefined,
      });
      if (retryOriginal.setCookies.length > 0) {
        for (const domain of cookieJar.store(
          retryOriginal.finalUrl,
          retryOriginal.setCookies,
        )) {
          cookieDomains.add(domain);
        }
      }
      if (
        retryOriginal.status >= 200 &&
        retryOriginal.status < 300 &&
        isRealContent(retryOriginal)
      ) {
        return {
          kind: "resolved",
          hops,
          result: retryOriginal,
          cookieDomains: [...cookieDomains],
        };
      }
      return {
        kind: "resolved",
        hops,
        result,
        cookieDomains: [...cookieDomains],
      };
    }

    const nextDetection = result.bodyText
      ? detectJsRedirect(result.bodyText, result.finalUrl)
      : null;
    if (!nextDetection || nextDetection.type !== "form-submit") {
      return {
        kind: "failed",
        hops,
        reason:
          "response is neither resolved content nor a further form-submit",
      };
    }
    if (!nextDetection.onlyHiddenAndSubmitInputs) {
      return { kind: "skipped-credentials" };
    }
    if (!nextDetection.formAction) {
      return { kind: "failed", hops, reason: "chained form has no action" };
    }

    currentUrl = nextDetection.formAction;
    currentFields = nextDetection.formFields ?? {};
    currentMethod = nextDetection.formMethod ?? "POST";
  }

  return { kind: "failed", hops, reason: "hop limit exceeded" };
}
