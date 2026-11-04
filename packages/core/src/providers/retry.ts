import type { FetchInit, FetchLike } from "./types";

export interface RetryOptions {
  /** Total attempts, including the first request. */
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Time allowed to receive response headers. Streaming generation is not timed out. */
  readonly timeoutMs?: number;
  readonly random?: () => number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly now?: () => number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_AFTER_CAP_MS = 60_000;

/**
 * Retries only the request that establishes the connection. Once a response is returned,
 * the caller owns it: retrying mid-stream would duplicate text already shown to the user.
 *
 * Retryable: network failures, timeouts, 429, and 5xx. `Retry-After` wins over backoff.
 */
export function createRetryingFetch(fetchImpl: FetchLike, options: RetryOptions = {}): FetchLike {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? delay;
  const now = options.now ?? Date.now;

  return async (url, init) => {
    let attempt = 1;
    for (;;) {
      throwIfAborted(init?.signal);
      try {
        const attemptResult = await fetchWithTimeout(fetchImpl, url, init, timeoutMs);
        const response = attemptResult.response;
        if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
          // Keep the abort bridge attached: the body may still be streaming.
          return response;
        }
        attemptResult.release();
        await cancelBody(response);
        await sleep(retryDelay(response.headers.get("retry-after"), attempt, options, now), init?.signal);
      } catch (error) {
        if (init?.signal?.aborted || attempt >= maxAttempts) {
          throw error;
        }
        await sleep(retryDelay(null, attempt, options, now), init?.signal);
      }
      attempt += 1;
    }
  };
}

interface AttemptResult {
  readonly response: Response;
  /** Detaches the caller's abort signal. Call only when discarding this response. */
  release(): void;
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: FetchInit | undefined,
  timeoutMs: number,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const external = init?.signal;
  const forwardAbort = () => controller.abort();
  if (external?.aborted) {
    controller.abort();
  } else {
    external?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return {
      response,
      release: () => external?.removeEventListener("abort", forwardAbort),
    };
  } catch (error) {
    clearTimeout(timer);
    external?.removeEventListener("abort", forwardAbort);
    throw error;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelay(
  retryAfter: string | null,
  attempt: number,
  options: RetryOptions,
  now: () => number,
): number {
  const headerDelay = parseRetryAfter(retryAfter, now);
  if (headerDelay !== null) {
    return Math.min(headerDelay, DEFAULT_RETRY_AFTER_CAP_MS);
  }
  const base = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const cap = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const exponential = base * 2 ** (attempt - 1);
  const jitter = 0.5 + (options.random ?? Math.random)() * 0.5;
  return Math.round(Math.min(cap, exponential * jitter));
}

function parseRetryAfter(value: string | null, now: () => number): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(0, date - now());
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A body that cannot be cancelled must not block the retry.
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
