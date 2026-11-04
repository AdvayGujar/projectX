import {
  AppError,
  createAdapter,
  createProviderConfig,
  createProviderRepository,
  createTurnEngine,
} from "@projectx/core";
import type {
  FetchLike,
  ModelInfo,
  PartInput,
  ProviderRuntime,
  ToolExecutor,
} from "@projectx/core";

import type { ImageAttachment } from "./attachments";

import { getDbContext } from "../db/client";
import { readProviderKey } from "./keyStore";
import { parseSelectionId, priceTurn } from "./turnMath";

const MAX_OUTPUT_TOKENS = 4_096;

const fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Tools arrive with the document pipeline; the engine still needs an executor. */
const noTools: ToolExecutor = {
  async execute(call) {
    return {
      toolCallId: call.id,
      name: call.name,
      content: "No tools are available yet.",
      isError: true,
    };
  },
};

export interface TurnUsage {
  readonly model: string;
  readonly effort: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number | null;
}

/**
 * What a UI has to implement to show a turn. The port never touches React, a store, or a
 * screen, so a different shell can supply its own sink (docs/ARCHITECTURE.md).
 */
export interface TurnSink {
  onUserTurn(id: string, text: string): void;
  onAssistantStart(id: string, reasoningRequested: boolean): void;
  onText(id: string, text: string): void;
  onReasoning(id: string, text: string): void;
  onUsage(id: string, usage: TurnUsage): void;
  onSettled(): void;
  onError(message: string): void;
}

export interface TurnInput {
  readonly sessionId: string;
  readonly text: string;
  /** `providerRowId:modelId`, as shown in the picker. */
  readonly selectionId: string;
  readonly effort: string;
  readonly think: boolean;
  readonly images?: readonly ImageAttachment[];
  /** Re-runs the answer to an existing user message instead of appending a new one. */
  readonly regenerate?: boolean;
}

export interface TurnPort {
  send(input: TurnInput): Promise<void>;
  stop(): void;
  isRunning(): boolean;
}

export function createTurnPort(sink: TurnSink): TurnPort {
  let controller: AbortController | null = null;

  async function send(input: TurnInput): Promise<void> {
    if (controller) {
      return;
    }
    const parsed = parseSelectionId(input.selectionId);
    if (!parsed) {
      sink.onError("That model selection is not usable. Pick it again.");
      return;
    }

    try {
      const context = await getDbContext();
      const providers = createProviderRepository(context);
      const provider = await providers.get(parsed.providerId);
      if (!provider) {
        throw new AppError("db_not_found", "Provider missing", {
          userMessage: "That provider no longer exists. Add it again in Settings.",
        });
      }

      const apiKey = await readProviderKey(provider.keyRef);
      if (!apiKey) {
        throw new AppError("provider_auth", "Provider key missing", {
          userMessage: "The key for this provider is missing. Add it again in Settings.",
        });
      }

      const model = await findModel(await providers.listModels(provider.id), parsed.modelId);
      const config = createProviderConfig(provider.presetId, {
        id: provider.id,
        label: provider.label,
        protocol: provider.protocol,
        baseUrl: provider.baseUrl,
      });
      const runtime: ProviderRuntime = { config, apiKey, fetch: fetchImpl };
      const engine = createTurnEngine({
        db: context,
        adapter: createAdapter(config.protocol),
        tools: noTools,
      });

      controller = new AbortController();

      const result = await engine.runTurn({
        sessionId: input.sessionId,
        model,
        provider: runtime,
        system: "",
        effort: input.effort,
        userParts: input.regenerate ? [] : userParts(input),
        maxOutputTokens: Math.min(model.maxOutput, MAX_OUTPUT_TOKENS),
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "turn_started":
              if (event.userMessageId) {
                sink.onUserTurn(event.userMessageId, input.text);
              }
              break;
            case "message_started":
              sink.onAssistantStart(event.messageId, input.think);
              break;
            case "text_delta":
              sink.onText(event.messageId, event.text);
              break;
            case "reasoning_delta":
              if (input.think) {
                sink.onReasoning(event.messageId, event.text);
              }
              break;
            case "usage":
              sink.onUsage(
                event.messageId,
                priceTurn(
                  {
                    inputTokens: event.usage.inputTokens,
                    outputTokens: event.usage.outputTokens,
                    costUsd: event.usage.costUsd,
                  },
                  model,
                  input.effort,
                ),
              );
              break;
            case "error":
              sink.onError(event.message);
              break;
            default:
              break;
          }
        },
      });

      if (result.error) {
        sink.onError(result.error.userMessage);
      }
    } catch (failure) {
      sink.onError(describe(failure));
    } finally {
      controller = null;
      sink.onSettled();
    }
  }

  return {
    send,
    stop: () => controller?.abort(),
    isRunning: () => controller !== null,
  };
}

/** Text first, then one attachment part per image so history can rebuild vision input. */
function userParts(input: TurnInput): PartInput[] {
  const parts: PartInput[] = [{ type: "text", data: { text: input.text } }];
  for (const image of input.images ?? []) {
    parts.push({
      type: "attachment",
      data: {
        kind: "image",
        name: image.name,
        mimeType: image.mimeType,
        data: image.base64,
      },
    });
  }
  return parts;
}

async function findModel(models: readonly ModelInfo[], modelId: string): Promise<ModelInfo> {
  const model = models.find((item) => item.id === modelId);
  if (!model) {
    throw new AppError("provider_invalid_response", "Model missing", {
      userMessage: "That model is no longer offered by the provider. Pick another one.",
    });
  }
  return model;
}

function describe(failure: unknown): string {
  if (failure instanceof AppError) {
    return failure.userMessage;
  }
  if (failure instanceof Error) {
    return failure.message;
  }
  return "The turn could not be completed.";
}
