import { createAnthropicAdapter } from "./anthropic";
import { createGoogleAdapter } from "./google";
import { createOpenAiChatAdapter } from "./openaiChat";
import { createOpenAiResponsesAdapter } from "./openaiResponses";
import type { Protocol, ProviderAdapter } from "./types";

export function createAdapter(protocol: Protocol): ProviderAdapter {
  switch (protocol) {
    case "openai-chat":
      return createOpenAiChatAdapter();
    case "openai-responses":
      return createOpenAiResponsesAdapter();
    case "anthropic":
      return createAnthropicAdapter();
    case "google":
      return createGoogleAdapter();
  }
}
