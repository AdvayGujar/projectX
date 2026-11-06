import type { WebFetchInput, WebFetchPort, WebFetchResult } from "@projectx/core";
import { AppError } from "@projectx/core";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "ProjectX/0.0.0";
const ACCEPT = "text/html,application/xhtml+xml,text/plain";

/**
 * Link port backed by the platform `fetch`. A link fetch is user-initiated and one-shot, so
 * the timeout is fixed, redirects follow, and a response over 2 MB is refused instead of
 * being held in memory.
 */
export function createAppWebFetch(): WebFetchPort {
  return {
    fetch(input: WebFetchInput): Promise<WebFetchResult> {
      return fetchLink(input);
    },
  };
}

async function fetchLink(input: WebFetchInput): Promise<WebFetchResult> {
  throwIfAborted(input.signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const forwardAbort = (): void => controller.abort();
  input.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await globalThis.fetch(input.url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: ACCEPT, "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    throwIfAborted(input.signal);
    if (!isSuccess(response.status)) {
      throw httpFailure(response.status);
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));
    const finalUrl = readFinalUrl(response, input.url);
    if (!isTextual(contentType)) {
      return { status: response.status, contentType, body: "", finalUrl };
    }

    rejectByContentLength(response.headers.get("content-length"));
    const body = await response.text();
    throwIfAborted(input.signal);
    rejectByLength(body.length);
    return { status: response.status, contentType, body, finalUrl };
  } catch (error) {
    throw toFetchError(error, input.signal, controller.signal);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", forwardAbort);
  }
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function isTextual(contentType: string | null): boolean {
  if (contentType === null) {
    return true;
  }
  return (
    contentType.startsWith("text/") ||
    contentType === "application/xhtml+xml" ||
    contentType === "application/xml" ||
    contentType === "application/json" ||
    contentType.endsWith("+xml") ||
    contentType.endsWith("+json")
  );
}

/** The header is the cheap gate; `body.length` (characters, so a lower bound on bytes) backs it up. */
function rejectByContentLength(value: string | null): void {
  if (value === null) {
    return;
  }
  const bytes = Number.parseInt(value, 10);
  if (Number.isFinite(bytes) && bytes > MAX_BODY_BYTES) {
    throw tooLarge();
  }
}

function rejectByLength(characters: number): void {
  if (characters > MAX_BODY_BYTES) {
    throw tooLarge();
  }
}

function normalizeContentType(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const base = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return base || null;
}

function readFinalUrl(response: Response, requested: string): string {
  return typeof response.url === "string" && response.url ? response.url : requested;
}

function toFetchError(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  fetchSignal: AbortSignal,
): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (callerSignal?.aborted) {
    return cancelled();
  }
  if (fetchSignal.aborted) {
    return new AppError("unknown", "Link fetch timed out", {
      cause: error,
      userMessage: "That link took too long to load.",
      retryable: true,
    });
  }
  return new AppError("unknown", "Could not fetch the link", {
    cause: error,
    userMessage: "Could not reach that site.",
  });
}

function httpFailure(status: number): AppError {
  return new AppError("unknown", `Link fetch returned HTTP ${status}`, {
    userMessage: `That site returned HTTP ${status}.`,
    retryable: status === 429 || status >= 500,
  });
}

function tooLarge(): AppError {
  return new AppError("file_too_large", "Link response exceeded the size cap", {
    userMessage: "That page is too large to save (over 2 MB).",
  });
}

function cancelled(): AppError {
  return new AppError("cancelled", "Link fetch cancelled", {
    userMessage: "Fetch cancelled.",
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw cancelled();
  }
}
