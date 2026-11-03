import type { ModelPricing } from "@projectx/core";
import {
  createMessageRepository,
  createProviderRepository,
  createSessionRepository,
} from "@projectx/core";
import type { MessageWithParts, Part } from "@projectx/core";
import type { TurnCost, ViewTurn } from "@projectx/ui";

import { getDbContext } from "../db/client";

export interface SessionSummary {
  readonly id: string;
  readonly title: string;
}

export interface LoadedSession {
  readonly title: string;
  readonly turns: readonly ViewTurn[];
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
}): Promise<string> {
  const context = await getDbContext();
  const session = await createSessionRepository(context).create({
    title: input.title,
    providerId: input.providerId,
    modelId: input.modelId,
  });
  return session.id;
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
  return { title: session.title, turns: messages.map((message) => toTurn(message, prices)).filter(isTurn) };
}

function toTurn(message: MessageWithParts, prices: Map<string, PriceEntry>): ViewTurn | null {
  const text = joinParts(message.parts, "text");
  if (message.role === "user") {
    return text.length > 0 ? { id: message.id, role: "user", text } : null;
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
