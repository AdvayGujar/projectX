import type { ModelPricing, RegenerationTarget } from "@projectx/core";
import {
  createMessageRepository,
  createProviderRepository,
  createSessionRepository,
  prepareRegeneration as prepareRegenerationInDatabase,
} from "@projectx/core";
import type { MessageWithParts, Part } from "@projectx/core";
import type { TurnAttachment, TurnCost, ViewTurn } from "@projectx/ui";

import { getDbContext } from "../db/client";
import { createAppFileStorage } from "./fileStorage";

export interface SessionSummary {
  readonly id: string;
  readonly title: string;
}

export interface SessionTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number | null;
  readonly costComplete: boolean;
}

export interface LoadedSession {
  readonly title: string;
  readonly pinned: boolean;
  readonly projectId: string | null;
  readonly turns: readonly ViewTurn[];
  readonly totals: SessionTotals;
}

interface PriceEntry {
  readonly label: string;
  readonly pricing?: ModelPricing;
}

export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  const context = await getDbContext();
  const sessions = await createSessionRepository(context).listRecent(limit);
  return sessions.map((session) => ({ id: session.id, title: session.title }));
}

export async function createSession(input: {
  title: string;
  providerId: string;
  modelId: string;
  projectId?: string | null;
}): Promise<string> {
  const context = await getDbContext();
  const session = await createSessionRepository(context).create({
    title: input.title,
    providerId: input.providerId,
    modelId: input.modelId,
    projectId: input.projectId ?? null,
  });
  return session.id;
}

export async function renameSession(id: string, title: string): Promise<void> {
  const context = await getDbContext();
  await createSessionRepository(context).update(id, { title });
}

export async function setSessionPinned(id: string, pinned: boolean): Promise<void> {
  const context = await getDbContext();
  await createSessionRepository(context).update(id, { pinned });
}

export async function setSessionProject(id: string, projectId: string | null): Promise<void> {
  const context = await getDbContext();
  await createSessionRepository(context).update(id, { projectId });
}

/**
 * Removes the chat and its session-owned files. Project-owned library files are kept: they
 * belong to the project, not to this chat. A cleanup failure is reported, not thrown, so the
 * chat row is never restored just because the sandbox is dirty.
 */
export async function deleteSession(id: string): Promise<{ cleanupWarning: string | null }> {
  const context = await getDbContext();
  await createSessionRepository(context).remove(id);
  try {
    await createAppFileStorage().removeDirectory(`sessions/${id}`);
    return { cleanupWarning: null };
  } catch {
    return {
      cleanupWarning: "The chat was deleted, but its session files could not be removed.",
    };
  }
}

/** Prepares the latest reply for regeneration and supersedes it in the session. */
export async function prepareRegeneration(
  sessionId: string,
  assistantMessageId: string,
): Promise<RegenerationTarget | null> {
  const context = await getDbContext();
  return prepareRegenerationInDatabase(context, sessionId, assistantMessageId);
}

export interface LoadedAttachment {
  readonly name: string;
  readonly mimeType: string;
  readonly kind: "image" | "document";
  readonly base64: string | null;
}

/** Reads one attachment's bytes only when the user taps its chip. */
export async function loadAttachment(
  messageId: string,
  index: number,
): Promise<LoadedAttachment | null> {
  const context = await getDbContext();
  const message = await createMessageRepository(context).get(messageId);
  if (!message) {
    return null;
  }
  const part = message.parts.filter((item) => item.type === "attachment")[index];
  if (!part) {
    return null;
  }
  const data = part.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const value = data as { name?: unknown; mimeType?: unknown; kind?: unknown; data?: unknown };
  if (typeof value.name !== "string") {
    return null;
  }
  return {
    name: value.name,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : "application/octet-stream",
    kind: value.kind === "image" ? "image" : "document",
    base64: typeof value.data === "string" ? value.data : null,
  };
}

/** Reads a session and maps stored messages/parts into view turns. */
export async function loadSession(sessionId: string): Promise<LoadedSession | null> {
  const context = await getDbContext();
  const session = await createSessionRepository(context).get(sessionId);
  if (!session) {
    return null;
  }
  const messages = await createMessageRepository(context).list(sessionId, { limit: 200 });
  const prices = await loadPrices();
  return {
    title: session.title,
    pinned: session.pinned,
    projectId: session.projectId,
    turns: messages.map((message) => toTurn(message, prices)).filter(isTurn),
    totals: totalsOf(messages, prices),
  };
}

function totalsOf(messages: readonly MessageWithParts[], prices: Map<string, PriceEntry>): SessionTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let costComplete = true;

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    inputTokens += message.inputTokens ?? 0;
    outputTokens += message.outputTokens ?? 0;
    const cost = numericCost(message, prices);
    if (cost === null) {
      costComplete = false;
    } else {
      costUsd += cost;
    }
  }

  return { inputTokens, outputTokens, costUsd: costComplete ? costUsd : null, costComplete };
}

function numericCost(message: MessageWithParts, prices: Map<string, PriceEntry>): number | null {
  if (message.costUsd !== null) {
    return message.costUsd;
  }
  const key = `${message.providerId ?? ""}:${message.modelId ?? ""}`;
  const pricing = prices.get(key)?.pricing;
  if (!pricing) {
    return null;
  }
  return perMillion(message.inputTokens ?? 0, message.outputTokens ?? 0, pricing);
}

function toTurn(message: MessageWithParts, prices: Map<string, PriceEntry>): ViewTurn | null {
  if (message.superseded) {
    return null;
  }
  const text = joinParts(message.parts, "text");
  if (message.role === "user") {
    const attachments = attachmentsOf(message.parts);
    if (text.length === 0 && attachments.length === 0) {
      return null;
    }
    return {
      id: message.id,
      role: "user",
      text,
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  }
  if (message.role !== "assistant") {
    return null;
  }
  const reasoning = joinParts(message.parts, "reasoning");
  const turn: ViewTurn = {
    id: message.id,
    role: "assistant",
    text,
    ...(reasoning.length > 0 ? { reasoning } : {}),
    ...(costOf(message, prices) ? { cost: costOf(message, prices) } : {}),
  };
  return turn;
}

function isTurn(turn: ViewTurn | null): turn is ViewTurn {
  return turn !== null;
}

function attachmentsOf(parts: readonly Part[]): TurnAttachment[] {
  const attachments: TurnAttachment[] = [];
  for (const part of parts) {
    if (part.type !== "attachment") {
      continue;
    }
    const data = part.data;
    if (typeof data !== "object" || data === null) {
      continue;
    }
    const value = data as { name?: unknown; mimeType?: unknown; kind?: unknown };
    if (typeof value.name !== "string") {
      continue;
    }
    attachments.push({
      index: attachments.length,
      name: value.name,
      mimeType: typeof value.mimeType === "string" ? value.mimeType : "application/octet-stream",
      kind: value.kind === "image" ? "image" : "document",
    });
  }
  return attachments;
}

function joinParts(parts: readonly Part[], type: "text" | "reasoning"): string {
  return parts
    .filter((part) => part.type === type)
    .map((part) => textOf(part))
    .join("");
}

function textOf(part: Part): string {
  const data = part.data;
  if (typeof data === "object" && data !== null && "text" in data) {
    const value = (data as { text: unknown }).text;
    return typeof value === "string" ? value : "";
  }
  return "";
}

function costOf(message: MessageWithParts, prices: Map<string, PriceEntry>): TurnCost | undefined {
  const input = message.inputTokens ?? 0;
  const output = message.outputTokens ?? 0;
  if (input === 0 && output === 0) {
    return undefined;
  }
  const key = `${message.providerId ?? ""}:${message.modelId ?? ""}`;
  const entry = prices.get(key);
  const usd = message.costUsd ?? (entry?.pricing ? perMillion(input, output, entry.pricing) : null);

  return {
    model: entry?.label ?? message.modelId ?? "unknown model",
    ...(message.effort ? { effort: message.effort } : {}),
    tokens: `${input.toLocaleString()} in / ${output.toLocaleString()} out`,
    ...(usd === null ? {} : { usd: `$${usd.toFixed(4)}` }),
  };
}

function perMillion(input: number, output: number, pricing: ModelPricing): number {
  return (input * pricing.input + output * pricing.output) / 1_000_000;
}

/** One pass over the model cache so stored turns can show a label and a price. */
async function loadPrices(): Promise<Map<string, PriceEntry>> {
  const context = await getDbContext();
  const repository = createProviderRepository(context);
  const providers = await repository.list();
  const entries = await Promise.all(
    providers.map(async (provider) => {
      const models = await repository.listModels(provider.id);
      return models.map((model) => ({
        key: `${provider.id}:${model.id}`,
        entry: { label: model.label, pricing: model.pricing } satisfies PriceEntry,
      }));
    }),
  );
  return new Map(entries.flat().map((item) => [item.key, item.entry]));
}
