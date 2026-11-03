import { AppError } from "../errors";
import type { AppErrorCode } from "../errors";

export async function providerError(response: Response, label: string): Promise<AppError> {
  const status = response.status;
  const code = codeForStatus(status);
  const detail = await readDetail(response);
  const message = `${label} returned HTTP ${status}${detail ? `: ${detail}` : ""}`;
  return new AppError(code, message, {
    retryable: status === 429 || status >= 500,
    userMessage: userMessageFor(code, label),
  });
}

function codeForStatus(status: number): AppErrorCode {
  if (status === 401 || status === 403) {
    return "provider_auth";
  }
  if (status === 429) {
    return "provider_rate_limit";
  }
  if (status >= 500) {
    return "provider_unavailable";
  }
  return "provider_invalid_response";
}

async function readDetail(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, " ").slice(0, 200);
  } catch {
    return "";
  }
}

function userMessageFor(code: AppErrorCode, label: string): string {
  if (code === "provider_auth") {
    return `${label} rejected the API key. Re-enter it in Settings.`;
  }
  if (code === "provider_rate_limit") {
    return `${label} is rate limiting requests. Try again shortly.`;
  }
  if (code === "provider_unavailable") {
    return `${label} is unavailable right now. Try again.`;
  }
  return `${label} returned an unexpected response.`;
}
