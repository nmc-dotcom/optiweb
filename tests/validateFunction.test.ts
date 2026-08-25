import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../functions/api/validate";

describe("W3C validation Pages Function", () => {
  afterEach(() => vi.restoreAllMocks());

  it("normalizes Nu HTML Checker messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              messages: [
                {
                  type: "error",
                  message: "Bad element",
                  lastLine: 7,
                  extract: "<bad>",
                },
                { type: "info", subtype: "warning", message: "Consider this" },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const request = new Request("https://audit.example.test/api/validate", {
      method: "POST",
      headers: {
        origin: "https://audit.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "html", source: "<!doctype html>" }),
    });
    const response = await onRequestPost({ request } as EventContext<
      unknown,
      string,
      unknown
    >);
    const data = (await response.json()) as {
      messages: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(data.messages).toEqual([
      { severity: "error", message: "Bad element", line: 7, extract: "<bad>" },
      { severity: "warning", message: "Consider this" },
    ]);
  });

  it("checks a public page through the official Nu Checker URL API", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://audit.example.test/api/validate", {
      method: "POST",
      headers: {
        origin: "https://audit.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "html",
        source: "<!doctype html>",
        url: "https://example.com/path?a=1&b=2",
      }),
    });
    const response = await onRequestPost({ request } as EventContext<
      unknown,
      string,
      unknown
    >);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("https://validator.w3.org/nu/?");
    expect(calledUrl).toContain(
      "doc=https%3A%2F%2Fexample.com%2Fpath%3Fa%3D1%26b%3D2",
    );
    expect(calledUrl).toContain("out=json");
  });

  it("falls back to source POST when Nu Checker cannot fetch the target URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              {
                type: "non-document-error",
                subType: "io",
                message: "HTTP error",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [{ type: "error", message: "Bad source", lastLine: 2 }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://audit.example.test/api/validate", {
      method: "POST",
      headers: {
        origin: "https://audit.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "html",
        source: "<!doctype html><bad>",
        url: "https://private.example.test/",
      }),
    });
    const response = await onRequestPost({ request } as EventContext<
      unknown,
      string,
      unknown
    >);
    const data = (await response.json()) as {
      messages: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://validator.w3.org/nu/?out=json",
    );
    expect(data.messages[0]).toMatchObject({
      severity: "error",
      message: "Bad source",
      line: 2,
    });
  });

  it("blocks cross-origin callers before contacting a validator", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://audit.example.test/api/validate", {
      method: "POST",
      headers: {
        origin: "https://other.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "html", source: "<p>test</p>" }),
    });

    const response = await onRequestPost({ request } as EventContext<
      unknown,
      string,
      unknown
    >);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
