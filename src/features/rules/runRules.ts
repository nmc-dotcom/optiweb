import { seoRules } from "./seo";
import { a11yRules } from "./a11y";
import { standardsRules } from "./standards";
import type { Issue, Rule, RuleContext } from "./types";

const ALL_RULES: Rule[] = [...seoRules, ...a11yRules, ...standardsRules];

// Run a small batch per idle slice rather than the whole rule set at once, so a ~30-rule
// pass on a large page can never block the main thread for one long synchronous stretch.
const RULES_PER_IDLE_SLICE = 5;

interface IdleDeadline {
  timeRemaining(): number;
  didTimeout: boolean;
}

function scheduleIdle(callback: (deadline: IdleDeadline) => void): void {
  const w = window as typeof window & {
    requestIdleCallback?: (cb: (deadline: IdleDeadline) => void) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(callback);
  } else {
    // Safari has no requestIdleCallback — a plain macrotask still yields to the event loop.
    setTimeout(() => callback({ timeRemaining: () => 0, didTimeout: true }), 0);
  }
}

function runOneRule(rule: Rule, ctx: RuleContext): Issue[] {
  try {
    return rule.check(ctx);
  } catch (err) {
    console.error(`[rules] ${rule.id} threw and was skipped:`, err);
    return [];
  }
}

/**
 * Runs every per-page rule (SEO/A11y/Standards — excludes the post-crawl duplicate
 * title/description pass, see seo/duplicates.ts) against one page. Each rule is isolated in
 * its own try/catch so one throwing rule can't take down the rest, and execution is chunked
 * across `requestIdleCallback` slices (see module comment on `RULES_PER_IDLE_SLICE`) so the
 * crawl's progress UI never freezes even at 100+ pages.
 */
export function runRules(ctx: RuleContext): Promise<Issue[]> {
  return new Promise((resolve) => {
    const results: Issue[] = [];
    let index = 0;

    function step(deadline: IdleDeadline) {
      let ranThisSlice = 0;
      while (
        index < ALL_RULES.length &&
        ranThisSlice < RULES_PER_IDLE_SLICE &&
        (deadline.timeRemaining() > 0 || deadline.didTimeout)
      ) {
        const rule = ALL_RULES[index];
        if (rule) results.push(...runOneRule(rule, ctx));
        index += 1;
        ranThisSlice += 1;
      }
      if (index < ALL_RULES.length) {
        scheduleIdle(step);
      } else {
        resolve(results);
      }
    }

    scheduleIdle(step);
  });
}
