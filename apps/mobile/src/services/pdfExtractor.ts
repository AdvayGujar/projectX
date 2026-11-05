import type { PdfPort, PdfRequestOptions } from "@projectx/core";
import { AppError } from "@projectx/core";
import { extractTextFromPage, getPageCount, isAvailable } from "expo-pdf-text-extract";

const NATIVE_TIMEOUT_MS = 30_000;

/**
 * PDF port backed by the platform extractor. Native reads cannot be interrupted, so the
 * signal is checked immediately before and after each call, and a timeout bounds the wait.
 */
export function createExpoPdfPort(): PdfPort {
  return {
    getPageCount(fileUri: string, options?: PdfRequestOptions): Promise<number> {
      return runNative(options, () => getPageCount(fileUri));
    },

    extractPage(
      fileUri: string,
      page: number,
      options?: PdfRequestOptions,
    ): Promise<string> {
      return runNative(options, () => extractTextFromPage(fileUri, page));
    },
  };
}

async function runNative<T>(
  options: PdfRequestOptions | undefined,
  call: () => Promise<T>,
): Promise<T> {
  throwIfAborted(options?.signal);
  ensureAvailable();

  try {
    const result = await withTimeout(call(), options?.signal);
    throwIfAborted(options?.signal);
    return result;
  } catch (error) {
    throw toPdfError(error);
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    function cleanup(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    function onAbort(): void {
      cleanup();
      reject(new AppError("cancelled", "PDF extraction cancelled", {
        userMessage: "PDF extraction cancelled.",
      }));
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new AppError("unknown", "PDF extraction timed out", {
        userMessage: "Reading this PDF took too long.",
      }));
    }, NATIVE_TIMEOUT_MS);

    signal?.addEventListener("abort", onAbort, { once: true });
    // The native promise settles the outer one unless the timer or abort path wins first.
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function ensureAvailable(): void {
  if (!isAvailable()) {
    throw new AppError("unknown", "PDF text extraction is unavailable", {
      userMessage: "PDF reading is not available in this build.",
    });
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError("cancelled", "PDF extraction cancelled", {
      userMessage: "PDF extraction cancelled.",
    });
  }
}

function toPdfError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const code = readCode(error);
  if (code === "PASSWORD_REQUIRED" || code === "INCORRECT_PASSWORD") {
    return new AppError("unknown", "PDF is password-protected", {
      cause: error,
      userMessage: "This PDF is password-protected.",
    });
  }
  if (code === "FILE_NOT_FOUND") {
    return new AppError("file_not_found", "PDF file not found", {
      cause: error,
      userMessage: "This PDF could not be found.",
    });
  }
  if (code === "CORRUPT_PDF") {
    return new AppError("unknown", "PDF is corrupt", {
      cause: error,
      userMessage: "This PDF could not be read.",
    });
  }
  if (code === "PDF_PAGE_ERROR") {
    return new AppError("unknown", "PDF page could not be read", {
      cause: error,
      userMessage: "This PDF page could not be read.",
    });
  }
  return new AppError("unknown", "Could not read the PDF", {
    cause: error,
    userMessage: "Could not read this PDF.",
  });
}

function readCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
