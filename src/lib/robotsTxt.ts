import { fetchProxy } from "./fetchProxy";

interface RobotsRule {
  type: "allow" | "disallow";
  pattern: string;
}

export interface RobotsRules {
  rules: RobotsRule[];
}

const EMPTY_RULES: RobotsRules = { rules: [] };

/** Minimal robots.txt parser: groups by User-agent, picks `*` (no per-bot targeting), Disallow/Allow only. */
export function parseRobotsTxt(text: string): RobotsRules {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let currentAgents: string[] = [];
  let currentRules: RobotsRule[] = [];
  let sawRuleSinceAgent = false;

  const flushGroup = () => {
    if (currentAgents.length > 0)
      groups.push({ agents: currentAgents, rules: currentRules });
    currentAgents = [];
    currentRules = [];
    sawRuleSinceAgent = false;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = (raw.split("#")[0] ?? "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (sawRuleSinceAgent) flushGroup();
      currentAgents.push(value.toLowerCase());
    } else if (field === "disallow") {
      currentRules.push(
        value === ""
          ? { type: "allow", pattern: "/" }
          : { type: "disallow", pattern: value },
      );
      sawRuleSinceAgent = true;
    } else if (field === "allow") {
      currentRules.push({ type: "allow", pattern: value });
      sawRuleSinceAgent = true;
    }
  }
  flushGroup();

  const wildcardGroup = groups.find((g) => g.agents.includes("*"));
  return wildcardGroup ? { rules: wildcardGroup.rules } : EMPTY_RULES;
}

function patternToRegExp(pattern: string): RegExp {
  const endsWithDollar = pattern.endsWith("$");
  const body = endsWithDollar ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped + (endsWithDollar ? "$" : ""));
}

/** Longest-matching-pattern wins (simplified robots.txt precedence rule). Defaults to allowed. */
export function isPathAllowed(pathname: string, rules: RobotsRules): boolean {
  let best: { type: "allow" | "disallow"; specificity: number } | null = null;
  for (const rule of rules.rules) {
    if (!rule.pattern) continue;
    if (!patternToRegExp(rule.pattern).test(pathname)) continue;
    if (!best || rule.pattern.length > best.specificity) {
      best = { type: rule.type, specificity: rule.pattern.length };
    }
  }
  return best ? best.type === "allow" : true;
}

/** Fetches and parses `/robots.txt` for the given origin via the proxy. Returns empty rules on any failure. */
export async function fetchRobotsRules(
  origin: string,
  timeoutMs: number,
): Promise<RobotsRules> {
  try {
    const result = await fetchProxy(new URL("/robots.txt", origin).toString(), {
      timeoutMs,
      retries: 0,
    });
    if (result.status !== 200 || !result.bodyText) return EMPTY_RULES;
    return parseRobotsTxt(result.bodyText);
  } catch {
    return EMPTY_RULES;
  }
}
