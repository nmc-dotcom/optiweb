import { describe, expect, it } from "vitest";
import { isPathAllowed, isUrlAllowed, parseRobotsTxt } from "../src/lib/robotsTxt";

describe("robots.txt path matching", () => {
  it("treats question marks as literal query separators, not regex wildcards", () => {
    const rules = parseRobotsTxt(`
User-agent: *
Disallow:
Disallow: /web/minister/bbs/
Disallow: /search/front/
Disallow: /web/*/file/
Disallow: /*?*
`);

    expect(isPathAllowed("/", rules)).toBe(true);
    expect(isPathAllowed("/web/unikorea/main", rules)).toBe(true);
    expect(isPathAllowed("/web/unikorea/bbs/bbs_0000000000000001", rules)).toBe(true);
    expect(isPathAllowed("/web/unikorea/bbs/bbs_0000000000000001?cp=2", rules)).toBe(false);
  });

  it("matches robots rules against the URL path and query used by crawler", () => {
    const rules = parseRobotsTxt(`
User-agent: *
Disallow: /*?*
`);

    expect(isUrlAllowed("https://www.unikorea.go.kr/web/unikorea/main", rules)).toBe(true);
    expect(
      isUrlAllowed(
        "https://www.unikorea.go.kr/web/unikorea/bbs/bbs_0000000000000021/list?baCategory1=announcemen_001",
        rules,
      ),
    ).toBe(false);
  });
});
