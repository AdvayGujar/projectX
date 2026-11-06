import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createAppWebFetch } from "../webFetch";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const originalFetch = globalThis.fetch;
const mockFetch = jest.fn<typeof fetch>();

interface FakeResponse {
  readonly status?: number;
  readonly contentType?: string | null;
  readonly contentLength?: string;
  readonly body?: string;
}

function respond(init: FakeResponse = {}): Response {
  const status = init.status ?? 200;
  const headers: Record<string, string> = {};
  if (init.contentType !== null) {
    headers["content-type"] = init.contentType ?? "text/html";
  }
  if (init.contentLength !== undefined) {
    headers["content-length"] = init.contentLength;
  }
  return new Response(init.body ?? "", { status, headers });
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

describe("app web fetch port", () => {
  it("fetches HTML with the link headers and a normalised content type", async () => {
    mockFetch.mockResolvedValue(
      respond({ contentType: "text/html; charset=utf-8", body: "<title>Report</title>" }),
    );
    const port = createAppWebFetch();

    const result = await port.fetch({ url: "https://example.com/report" });

    expect(result).toEqual({
      status: 200,
      contentType: "text/html",
      body: "<title>Report</title>",
      finalUrl: "https://example.com/report",
    });
    const init = mockFetch.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({
      Accept: "text/html,application/xhtml+xml,text/plain",
      "User-Agent": "ProjectX/0.0.0",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the content type and an empty body for media", async () => {
    mockFetch.mockResolvedValue(respond({ contentType: "video/mp4", body: "ignored" }));
    const port = createAppWebFetch();

    const result = await port.fetch({ url: "https://cdn.example.com/clip.mp4" });

    expect(result).toEqual({
      status: 200,
      contentType: "video/mp4",
      body: "",
      finalUrl: "https://cdn.example.com/clip.mp4",
    });
  });

  it("rejects a non-2xx response with a readable message", async () => {
    mockFetch.mockResolvedValue(respond({ status: 404 }));
    const port = createAppWebFetch();

    await expect(port.fetch({ url: "https://example.com/missing" })).rejects.toMatchObject({
      code: "unknown",
      userMessage: "That site returned HTTP 404.",
    });
  });

  it("rejects an oversized content-length before reading the body", async () => {
    mockFetch.mockResolvedValue(
      respond({ contentLength: String(MAX_BODY_BYTES + 1), body: "x" }),
    );
    const port = createAppWebFetch();

    await expect(port.fetch({ url: "https://example.com/huge" })).rejects.toMatchObject({
      code: "file_too_large",
      userMessage: "That page is too large to save (over 2 MB).",
    });
  });

  it("rejects an oversized body when the header is missing", async () => {
    mockFetch.mockResolvedValue(respond({ body: "x".repeat(MAX_BODY_BYTES + 1) }));
    const port = createAppWebFetch();

    await expect(port.fetch({ url: "https://example.com/huge" })).rejects.toMatchObject({
      code: "file_too_large",
    });
  });

  it("times out after fifteen seconds", async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    }));
    const port = createAppWebFetch();
    const pending = port.fetch({ url: "https://example.com/slow" });

    jest.advanceTimersByTime(15_000);

    await expect(pending).rejects.toMatchObject({
      userMessage: "That link took too long to load.",
      retryable: true,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("rejects an already-aborted signal without calling fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const port = createAppWebFetch();

    await expect(
      port.fetch({ url: "https://example.com/report", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled", userMessage: "Fetch cancelled." });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports a caller abort as cancelled, not a timeout", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    const port = createAppWebFetch();

    await expect(
      port.fetch({ url: "https://example.com/report", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled", userMessage: "Fetch cancelled." });
  });
});
