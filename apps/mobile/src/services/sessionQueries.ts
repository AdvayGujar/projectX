import type { ModelPricing, RegenerationTarget, ToolRole } from "@projectx/core";
import {
  createMessageRepository,
  createProviderRepository,
  createSessionRepository,
  prepareRegeneration as prepareRegenerationInDatabase,
} from "@projectx/core";
import type { MessageWithParts, Part } from "@projectx/core";
import type { ToolActivity, TurnAttachment, TurnCost, ViewTurn } from "@projectx/ui";

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
  /** Stored file id for a document part; images live only in the message payload. */
  readonly fileId: string | null;
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
  const value = data as {
    name?: unknown;
    mimeType?: unknown;
    kind?: unknown;
    data?: unknown;
    fileId?: unknown;
  };
  if (typeof value.name !== "string") {
    return null;
  }
  return {
    name: value.name,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : "application/octet-stream",
    kind: value.kind === "image" ? "image" : "document",
    base64: typeof value.data === "string" ? value.data : null,
    fileId: typeof value.fileId === "string" ? value.fileId : null,
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
    turns: toTurns(messages, prices),
    totals: totalsOf(messages, prices),
  };
}

interface StoredToolResult {
  readonly name: string;
  readonly role: ToolRole;
  readonly detail: string;
}

interface StoredToolCall {
  readonly id: string;
  readonly name: string;
  readonly role: ToolRole;
}

/** A tool-using turn is several assistant messages; the transcript shows one row. */
function toTurns(
  messages: readonly MessageWithParts[],
  prices: Map<string, PriceEntry>,
): ViewTurn[] {
  const visible = messages.filter((message) => !message.superseded);
  const results = collectToolResults(visible);
  const turns: ViewTurn[] = [];
  let index = 0;

  while (index < visible.length) {
    const message = visible[index];
    if (!message) {
      break;
    }
    if (message.role === "user") {
      const turn = userTurn(message);
      if (turn) {
        turns.push(turn);
      }
      index += 1;
      continue;
    }
    if (message.role !== "assistant") {
      index += 1;
      continue;
    }
    const run: MessageWithParts[] = [];
    while (index < visible.length) {
      const current = visible[index];
      if (!current || current.role === "user" || current.role === "system") {
        break;
      }
      if (current.role === "assistant") {
        run.push(current);
      }
      index += 1;
    }
    const turn = assistantTurn(run, results, prices);
    if (turn) {
      turns.push(turn);
    }
  }

  return turns;
}

function userTurn(message: MessageWithParts): ViewTurn | null {
  const text = joinParts(message.parts, "text");
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

function assistantTurn(
  run: readonly MessageWithParts[],
  results: ReadonlyMap<string, StoredToolResult>,
  prices: Map<string, PriceEntry>,
): ViewTurn | null {
  const last = run.at(-1);
  if (!last) {
    return null;
  }
  const text = run.map((message) => joinParts(message.parts, "text")).filter(Boolean).join("\n\n");
  const reasoning = run
    .map((message) => joinParts(message.parts, "reasoning"))
    .filter(Boolean)
    .join("\n\n");
  const activity = activityOf(run, results);
  const cost = costOfRun(run, prices);

  return {
    id: last.id,
    role: "assistant",
    text,
    ...(reasoning.length > 0 ? { reasoning } : {}),
    ...(activity.length > 0 ? { activity } : {}),
    ...(cost ? { cost } : {}),
  };
}

function activityOf(
  run: readonly MessageWithParts[],
  results: ReadonlyMap<string, StoredToolResult>,
): ToolActivity[] {
  const activity: ToolActivity[] = [];
  for (const message of run) {
    for (const part of message.parts) {
      if (part.type !== "tool_call") {
        continue;
      }
      const call = storedToolCall(part);
      const result = call ? results.get(call.id) : undefined;
      if (!call || !result) {
        continue;
      }
      activity.push({
        kind: result.role === "write" ? "wrote" : "read",
        tool: call.name,
        detail: result.detail,
      });
    }
  }
  return activity;
}

function collectToolResults(
  messages: readonly MessageWithParts[],
): Map<string, StoredToolResult> {
  const results = new Map<string, StoredToolResult>();
  for (const message of messages) {
    if (message.role !== "tool") {
      continue;
    }
    for (const part of message.parts) {
      if (part.type !== "tool_result") {
        continue;
      }
      const result = storedToolResult(part);
      if (result) {
        results.set(result.toolCallId, result);
      }
    }
  }
  return results;
}

function storedToolCall(part: Part): StoredToolCall | null {
  const data = part.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const value = data as { id?: unknown; name?: unknown; role?: unknown };
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return { id: value.id, name: value.name, role: toRole(value.role) };
}

function storedToolResult(
  part: Part,
): (StoredToolResult & { readonly toolCallId: string }) | null {
  const data = part.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const value = data as {
    toolCallId?: unknown;
    name?: unknown;
    role?: unknown;
    display?: unknown;
  };
  if (typeof value.toolCallId !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    toolCallId: value.toolCallId,
    name: value.name,
    role: toRole(value.role),
    detail: typeof value.display === "string" ? value.display : value.name,
  };
}

function toRole(value: unknown): ToolRole {
  return value === "write" ? "write" : "read";
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

function costOfRun(
  run: readonly MessageWithParts[],
  prices: Map<string, PriceEntry>,
): TurnCost | undefined {
  const input = run.reduce((total, message) => total + (message.inputTokens ?? 0), 0);
  const output = run.reduce((total, message) => total + (message.outputTokens ?? 0), 0);
  if (input === 0 && output === 0) {
    return undefined;
  }
  const last = run.at(-1);
  const key = `${last?.providerId ?? ""}:${last?.modelId ?? ""}`;
  const entry = prices.get(key);
  const costs = run.map((message) => numericCost(message, prices));
  const usd = costs.every((cost): cost is number => cost !== null)
    ? costs.reduce((total, cost) => total + cost, 0)
    : null;

  return {
    model: entry?.label ?? last?.modelId ?? "unknown model",
    ...(last?.effort ? { effort: last.effort } : {}),
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
