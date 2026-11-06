import {
  AppError,
  applyKnownCapabilities,
  createAdapter,
  createArtifactRepository,
  createProjectContextRetriever,
  createProjectRepository,
  createProviderConfig,
  createProviderRepository,
  createReadTools,
  createRetryingFetch,
  createSessionRepository,
  createTurnEngine,
  READ_TOOL_GUIDANCE,
} from "@projectx/core";
import type {
  DbContext,
  FetchLike,
  ModelInfo,
  PartInput,
  ProviderRuntime,
  ReasoningRequest,
} from "@projectx/core";

import type { CitationRef, ToolActivity, TurnAttachment } from "@projectx/ui";

import type { ImageAttachment } from "./attachments";

import { getDbContext } from "../db/client";
import { readProviderKey } from "./keyStore";
import { composeSystemPrompt, parseSelectionId, priceTurn } from "./turnMath";

const MAX_OUTPUT_TOKENS = 4_096;

const fetchImpl: FetchLike = createRetryingFetch((url, init) => fetch(url, init));

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
  onUserTurn(id: string, text: string, attachments?: readonly TurnAttachment[]): void;
  /** `step` is 1 for the first assistant message of a turn and 2+ after each tool round. */
  onAssistantStart(id: string, reasoningRequested: boolean, step: number): void;
  onText(id: string, text: string): void;
  onReasoning(id: string, text: string): void;
  onToolActivity(id: string, activity: ToolActivity): void;
  onCitations(id: string, citations: readonly CitationRef[]): void;
  onUsage(id: string, usage: TurnUsage): void;
  /** Receives the final assistant message id so a multi-step turn can adopt it. */
  onTurnFinished(id: string | null): void;
  onSettled(): void;
  onError(message: string): void;
}

/** A document that already lives in the project library; the bytes stay in storage. */
export interface DocumentAttachment {
  readonly fileId: string;
  readonly name: string;
  readonly mimeType: string;
}

export interface TurnInput {
  readonly sessionId: string;
  readonly text: string;
  /** `providerRowId:modelId`, as shown in the picker. */
  readonly selectionId: string;
  readonly effort: string;
  readonly reasoning: ReasoningRequest;
  readonly images?: readonly ImageAttachment[];
  readonly documents?: readonly DocumentAttachment[];
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

      const model = await findModel(
        applyKnownCapabilities(provider.presetId, await providers.listModels(provider.id)),
        parsed.modelId,
      );
      const system = await systemPromptFor(context, input, model);
      const config = createProviderConfig(provider.presetId, {
        id: provider.id,
        label: provider.label,
        protocol: provider.protocol,
        baseUrl: provider.baseUrl,
      });
      const runtime: ProviderRuntime = { config, apiKey, fetch: fetchImpl };
      const tools = createReadTools(context);
      const engine = createTurnEngine({
        db: context,
        adapter: createAdapter(config.protocol),
        tools,
      });

      controller = new AbortController();

      const result = await engine.runTurn({
        sessionId: input.sessionId,
        model,
        provider: runtime,
        system,
        effort: input.effort,
        reasoning: input.reasoning,
        userParts: input.regenerate ? [] : userParts(input),
        tools: model.capabilities.tools ? tools.schemas : [],
        maxOutputTokens: Math.min(model.maxOutput, MAX_OUTPUT_TOKENS),
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "turn_started":
              if (event.userMessageId) {
                sink.onUserTurn(event.userMessageId, input.text, attachmentsOf(input));
              }
              break;
            case "message_started":
              sink.onAssistantStart(event.messageId, input.reasoning.mode === "on", event.step);
              break;
            case "text_delta":
              sink.onText(event.messageId, event.text);
              break;
            case "reasoning_delta":
              sink.onReasoning(event.messageId, event.text);
              break;
            case "tool_result":
              sink.onToolActivity(event.assistantMessageId, {
                kind: event.role === "write" ? "wrote" : "read",
                tool: event.result.name,
                detail: event.result.display ?? event.result.name,
              });
              if (event.result.citations && event.result.citations.length > 0) {
                sink.onCitations(event.assistantMessageId, event.result.citations);
              }
              break;
            case "turn_finished":
              sink.onTurnFinished(event.messageId);
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
      if (!controller?.signal.aborted) {
        sink.onError(describe(failure));
      }
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

/**
 * Project chats get guidance, retrieved library text, and the artifact catalog. Standalone
 * chats still get their own artifact catalog and the read-tool instruction when supported.
 */
async function systemPromptFor(
  context: DbContext,
  input: TurnInput,
  model: ModelInfo,
): Promise<string> {
  const session = await createSessionRepository(context).get(input.sessionId);
  const project = session?.projectId
    ? await createProjectRepository(context).get(session.projectId)
    : null;
  const retrieved = session?.projectId
    ? await createProjectContextRetriever(context).retrieve({
      projectId: session.projectId,
      sessionId: input.sessionId,
      query: input.text,
      maxTokens: retrievalBudget(model),
    })
    : null;
  const artifacts = retrieved?.artifacts ?? (
    session
      ? await createArtifactRepository(context).listSummaries({
        projectId: null,
        sessionId: session.id,
      })
      : []
  );
  const base = composeSystemPrompt(project?.instructions, retrieved?.text, artifacts);
  const guidance = model.capabilities.tools ? READ_TOOL_GUIDANCE : "";
  return [base, guidance].filter(Boolean).join("\n\n");
}

/** Retrieval gets a quarter of the model window, bounded so small and huge models stay sane. */
function retrievalBudget(model: ModelInfo): number {
  return Math.max(1_000, Math.min(8_000, Math.floor(model.contextWindow * 0.25)));
}

function attachmentsOf(input: TurnInput): TurnAttachment[] {
  const images = (input.images ?? []).map((image, index) => ({
    index,
    name: image.name,
    mimeType: image.mimeType,
    kind: "image" as const,
  }));
  const documents = (input.documents ?? []).map((document, index) => ({
    index: images.length + index,
    name: document.name,
    mimeType: document.mimeType,
    kind: "document" as const,
  }));
  return [...images, ...documents];
}

/** Text first, then images, then documents so history and chip indices stay aligned. */
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
  for (const document of input.documents ?? []) {
    parts.push({
      type: "attachment",
      data: {
        kind: "document",
        fileId: document.fileId,
        name: document.name,
        mimeType: document.mimeType,
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
