import type { IssueSeverity, ProxyErrorType } from "../../types";

export type StatusBucket =
  | "ok"
  | "redirect"
  | "auth_required"
  | "not_found"
  | "gone"
  | "rate_limited"
  | "client_error"
  | "server_error"
  | "network_error";

const NETWORK_ERROR_TYPES: ProxyErrorType[] = [
  "timeout",
  "dns",
  "network",
  "ssrf_blocked",
  "origin_blocked",
  "too_many_redirects",
  "response_too_large",
];

export function classifyStatus(
  status: number,
  errorType?: ProxyErrorType,
): StatusBucket {
  if (errorType && NETWORK_ERROR_TYPES.includes(errorType))
    return "network_error";
  if (status === 401 || status === 403) return "auth_required";
  if (status === 404) return "not_found";
  if (status === 410) return "gone";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  if (status >= 300) return "redirect";
  if (status >= 200) return "ok";
  return "network_error";
}

export function describeError(errorType?: ProxyErrorType): string {
  switch (errorType) {
    case "timeout":
      return "Timeout";
    case "dns":
      return "DNS Error";
    case "network":
      return "Network Error";
    case "ssrf_blocked":
      return "Blocked (internal address)";
    case "origin_blocked":
      return "Blocked (origin not allowed)";
    case "too_many_redirects":
      return "Too many redirects";
    case "response_too_large":
      return "Response too large";
    default:
      return "Unknown error";
  }
}

export interface StatusClassification {
  bucket: StatusBucket;
  isBroken: boolean;
  severity: IssueSeverity;
  issue: string;
}

/**
 * Turns a proxy result's (status, errorType, redirect info) into a human-facing
 * classification. `redirectChainLength`/`isRedirectLoop` are orthogonal to the final
 * status bucket — the proxy always follows redirects to a final response, so a
 * page can be both "reached via 2 redirects" and "200 OK".
 */
export function classify(
  status: number,
  errorType: ProxyErrorType | undefined,
  redirectChainLength: number,
  isRedirectLoop: boolean,
): StatusClassification {
  const bucket = classifyStatus(status, errorType);

  if (isRedirectLoop) {
    return {
      bucket,
      isBroken: true,
      severity: "error",
      issue: "Redirect loop detected",
    };
  }

  switch (bucket) {
    case "ok":
      if (redirectChainLength > 0) {
        return {
          bucket: "redirect",
          isBroken: false,
          severity: redirectChainLength > 2 ? "warning" : "info",
          issue: `Redirected (${redirectChainLength} hop${redirectChainLength > 1 ? "s" : ""})`,
        };
      }
      return { bucket, isBroken: false, severity: "info", issue: "OK" };
    case "redirect":
      return {
        bucket,
        isBroken: false,
        severity: "warning",
        issue: `Redirect response (${status})`,
      };
    case "not_found":
      return {
        bucket,
        isBroken: true,
        severity: "error",
        issue: "404 Not Found",
      };
    case "gone":
      return { bucket, isBroken: true, severity: "error", issue: "410 Gone" };
    case "server_error":
      return {
        bucket,
        isBroken: true,
        severity: "error",
        issue: `Server error (${status})`,
      };
    case "client_error":
      return {
        bucket,
        isBroken: true,
        severity: "error",
        issue: `Client error (${status})`,
      };
    case "rate_limited":
      return {
        bucket,
        isBroken: false,
        severity: "warning",
        issue: "429 Too Many Requests",
      };
    case "auth_required":
      return {
        bucket,
        isBroken: false,
        severity: "warning",
        issue: `Auth required (${status})`,
      };
    case "network_error":
      return {
        bucket,
        isBroken: true,
        severity: "error",
        issue: describeError(errorType),
      };
  }
}
