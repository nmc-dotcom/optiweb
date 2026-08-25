import dns from "node:dns/promises";
import net from "node:net";

const DANGEROUS_SEGMENTS = new Set([
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
const DANGEROUS_ACTIONS = new Set([
  "delete",
  "destroy",
  "logout",
  "payment",
  "purchase",
  "remove",
  "unsubscribe",
]);

export function isSafeReadOnlyUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const segments = url.pathname
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  if (segments.some((segment) => DANGEROUS_SEGMENTS.has(segment))) return false;
  for (const [key, value] of url.searchParams) {
    if (
      ["action", "command", "do"].includes(key.toLowerCase()) &&
      DANGEROUS_ACTIONS.has(value.toLowerCase())
    )
      return false;
  }
  return true;
}

function privateIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part)))
    return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function isPrivateAddress(address) {
  const normalized = address.toLowerCase().split("%")[0];
  if (net.isIP(normalized) === 4) return privateIpv4(normalized);
  if (net.isIP(normalized) !== 6) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return net.isIP(mapped) === 4 ? privateIpv4(mapped) : true;
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:")
  );
}

export async function assertPublicUrl(value, lookup = dns.lookup) {
  if (!isSafeReadOnlyUrl(value)) throw new Error("unsafe_url");
  const url = new URL(value);
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !records.length ||
    records.some((record) => isPrivateAddress(record.address))
  )
    throw new Error("private_or_unresolved_host");
  return url;
}

export function isSameHostFamily(candidate, registered) {
  const a = candidate.toLowerCase().replace(/\.$/, "");
  const b = registered.toLowerCase().replace(/\.$/, "");
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
