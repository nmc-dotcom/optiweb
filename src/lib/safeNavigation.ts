const DANGEROUS_PATH_SEGMENTS = new Set([
  "admin",
  "checkout",
  "delete",
  "destroy",
  "logout",
  "payment",
  "purchase",
  "remove",
  "signout",
  "unsubscribe",
]);

const DANGEROUS_QUERY_VALUES = new Set([
  "delete",
  "destroy",
  "logout",
  "payment",
  "purchase",
  "remove",
  "unsubscribe",
]);

/**
 * Conservative navigation guard for the read-only crawler.
 *
 * A GET endpoint should be side-effect free, but some sites still expose destructive
 * operations as GET links. Those links are rejected before any network request.
 */
export function isSafeReadOnlyUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const pathSegments = url.pathname
    .toLowerCase()
    .split("/")
    .map((segment) => decodeURIComponentSafely(segment))
    .filter(Boolean);
  if (pathSegments.some((segment) => DANGEROUS_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  for (const [key, value] of url.searchParams) {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = value.toLowerCase();
    if (
      (normalizedKey === "action" ||
        normalizedKey === "do" ||
        normalizedKey === "command") &&
      DANGEROUS_QUERY_VALUES.has(normalizedValue)
    ) {
      return false;
    }
  }
  return true;
}

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
