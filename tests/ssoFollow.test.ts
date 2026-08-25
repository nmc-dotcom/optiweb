import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsRedirectDetection } from "../src/features/crawler/htmlParser";
import type { CookieJar } from "../src/lib/cookieJar";

const fetchProxyMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/fetchProxy", () => ({
  fetchProxy: fetchProxyMock,
}));

const { followSsoSession } = await import("../src/features/crawler/ssoFollow");

function cookieJar(): CookieJar {
  return {
    store: vi.fn(() => []),
    getCookieHeader: vi.fn(() => ""),
    clear: vi.fn(),
  };
}

describe("followSsoSession", () => {
  afterEach(() => {
    fetchProxyMock.mockReset();
  });

  it("submits hidden fields as query parameters for GET SSO forms", async () => {
    const detection: JsRedirectDetection = {
      type: "form-submit",
      targetHost: "sso.example.test",
      formAction: "https://sso.example.test/login?existing=1",
      formMethod: "GET",
      formFields: {
        RelayState: "abc",
        SAMLRequest: "xyz",
      },
      onlyHiddenAndSubmitInputs: true,
    };

    fetchProxyMock.mockResolvedValueOnce({
      requestedUrl: "https://sso.example.test/login",
      finalUrl: "https://sso.example.test/login",
      status: 500,
      statusText: "Internal Server Error",
      redirectChain: [],
      isRedirectLoop: false,
      contentType: "text/html",
      xRobotsTag: null,
      bodyText: "",
      bodyTruncated: false,
      responseTimeMs: 1,
      setCookies: [],
    });

    await followSsoSession(detection, "https://example.test/", cookieJar(), 1_000);

    expect(fetchProxyMock).toHaveBeenCalledWith(
      "https://sso.example.test/login?existing=1&RelayState=abc&SAMLRequest=xyz",
      expect.objectContaining({ method: "GET", body: undefined }),
    );
  });
});
