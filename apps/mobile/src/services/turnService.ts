import {
  AppError,
  createAdapter,
  createProviderConfig,
  createProviderRepository,
  createTurnEngine,
} from "@projectx/core";
import type { FetchLike, ModelInfo, ProviderRuntime, ToolExecutor, Usage } from "@projectx/core";
import type { TurnCost } from "@projectx/ui";

import { getDbContext } from "../db/client";
import { useModelStore } from "../state/modelStore";
import { useSessionStore } from "../state/sessionStore";
import { useSessionsStore } from "../state/sessionsStore";
import { readProviderKey } from "./keyStore";

const MAX_OUTPUT_TOKENS = 4_096;

let controller: AbortController | null = null;

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

export interface SendTurnInput {
  readonly sessionId: string;
  readonly text: string;
  /** The composer's Think toggle for this turn. */
  readonly think: boolean;
}

/**
 * The only place a turn runs. Screens call `sendTurn` and read the session store; they never
 * touch the engine or a provider directly (plan §7).
 */
export async function sendTurn(input: SendTurnInput): Promise<void> {
  if (controller) {
    return;
  }
  const store = useSessionStore.getState();
  const selection = useModelStore.getState().current;
  if (!selection) {
    store.setError("Choose a model before sending.");
    return;
  }

  const parsed = parseSelectionId(selection.id);
  if (!parsed) {
    store.setError("That model selection is not usable. Pick it again.");
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

    if (store.activeSessionId !== input.sessionId) {
      store.resetSession(input.sessionId);
    }
    store.setError(null);
    store.setStreaming(true);
    controller = new AbortController();

    const result = await engine.runTurn({
      sessionId: input.sessionId,
      model,
      provider: runtime,
      system: "",
      userParts: [{ type: "text", data: { text: input.text } }],
      maxOutputTokens: Math.min(model.maxOutput, MAX_OUTPUT_TOKENS),
      signal: controller.signal,
      onEvent: (event) => {
        const state = useSessionStore.getState();
        switch (event.type) {
          case "turn_started":
            state.addTurn({ id: event.userMessageId ?? `user-${Date.now()}`, role: "user", text: input.text });
            break;
          case "message_started":
            state.addTurn({
              id: event.messageId,
              role: "assistant",
              text: "",
              status: "streaming",
              reasoningRequested: input.think,
            });
            break;
          case "text_delta":
            state.appendText(event.messageId, event.text);
            break;
          case "reasoning_delta":
            if (input.think) {
              state.appendReasoning(event.messageId, event.text);
            }
            break;
          case "usage": {
            const cost = costOf(event.usage, model, selection.effort);
            state.setCost(event.messageId, cost.turn);
            state.addUsage({
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              costUsd: cost.usd,
            });
            break;
          }
          case "error":
            state.setError(event.message);
            break;
          default:
            break;
        }
      },
    });

    if (result.error) {
      store.setError(result.error.userMessage);
    }
    void useSessionsStore.getState().refresh();
  } catch (failure) {
    store.setError(describe(failure));
  } finally {
    controller = null;
    const state = useSessionStore.getState();
    state.settleStreaming();
    state.setStreaming(false);
  }
}

/** Aborts the running turn; the engine keeps whatever was streamed so far. */
export function stopTurn(): void {
  controller?.abort();
}

function parseSelectionId(id: string): { providerId: string; modelId: string } | null {
  const separator = id.indexOf(":");
  if (separator <= 0 || separator === id.length - 1) {
    return null;
  }
  return { providerId: id.slice(0, separator), modelId: id.slice(separator + 1) };
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

interface PricedCost {
  readonly turn: TurnCost;
  readonly usd: number | null;
}

function costOf(usage: Usage, model: ModelInfo, effort: string): PricedCost {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const usd =
    usage.costUsd ??
    (model.pricing ? (input * model.pricing.input + output * model.pricing.output) / 1_000_000 : null);

  return {
    usd,
    turn: {
      model: model.label,
      effort,
      tokens: `${input.toLocaleString()} in / ${output.toLocaleString()} out`,
      ...(usd === null ? {} : { usd: `$${usd.toFixed(4)}` }),
    },
  };
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
