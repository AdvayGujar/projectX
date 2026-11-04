import { describe, expect, it } from "vitest";

import { createRetryingFetch } from "../retry";
import type { FetchInit, FetchLike } from "../types";

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response("", { status, headers });
}

function tracker(delays: number[]) {
  const sleep = async (ms: number) => {
    delays.push(ms);
  };
  return sleep;
}

const options = {
  maxAttempts: 3,
  baseDelayMs: 100,
  random: () => 0.5,
};

describe("retrying fetch", () => {
  it("retries 5xx and 429 with jittered backoff", async () => {
    const delays: number[] = [];
    const statuses = [500, 429, 200];
    const fetchImpl: FetchLike = async () => response(statuses.shift() ?? 200);
    const retrying = createRetryingFetch(fetchImpl, { ...options, sleep: tracker(delays) });

    const result = await retrying("https://example.test", {});

    expect(result.status).toBe(200);
    expect(delays).toEqual([75, 150]);
  });

  it("honours Retry-After seconds over backoff", async () => {
    const delays: number[] = [];
    const statuses = [429, 200];
    const fetchImpl: FetchLike = async () =>
      response(statuses.shift() ?? 200, { "retry-after": "2" });
    const retrying = createRetryingFetch(fetchImpl, { ...options, sleep: tracker(delays) });

    await retrying("https://example.test", {});

    expect(delays).toEqual([2_000]);
  });

  it("returns the last response when attempts run out", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return response(503);
    };
    const retrying = createRetryingFetch(fetchImpl, {
      ...options,
      maxAttempts: 2,
      sleep: async () => undefined,
    });

    const result = await retrying("https://example.test", {});

    expect(result.status).toBe(503);
    expect(calls).toBe(2);
  });

  it("does not retry client errors", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return response(401);
    };
    const retrying = createRetryingFetch(fetchImpl, { ...options, sleep: async () => undefined });

    const result = await retrying("https://example.test", {});

    expect(result.status).toBe(401);
    expect(calls).toBe(1);
  });

  it("retries network failures", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("Network request failed");
      }
      return response(200);
    };
    const retrying = createRetryingFetch(fetchImpl, { ...options, sleep: async () => undefined });

    const result = await retrying("https://example.test", {});

    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("keeps aborting the streaming body after headers arrive", async () => {
    let captured: AbortSignal | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      captured = init?.signal;
      return response(200);
    };
    const retrying = createRetryingFetch(fetchImpl, options);
    const controller = new AbortController();

    await retrying("https://example.test", { signal: controller.signal });
    expect(captured?.aborted).toBe(false);

    controller.abort();
    expect(captured?.aborted).toBe(true);
  });

  it("stops before the first request when already aborted", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return response(200);
    };
    const retrying = createRetryingFetch(fetchImpl, options);
    const controller = new AbortController();
    controller.abort();
    const init: FetchInit = { signal: controller.signal };

    await expect(retrying("https://example.test", init)).rejects.toThrow("Aborted");
    expect(calls).toBe(0);
  });
});
