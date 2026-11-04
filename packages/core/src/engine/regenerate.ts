import { createMessageRepository } from "../db";
import type { DbContext, MessageWithParts, Part } from "../db";

export interface RegenerationTarget {
  /** `providerRowId:modelId`, as the picker and the turn port use it. */
  readonly selectionId: string;
  readonly effort: string;
  readonly text: string;
}

/**
 * Prepares the latest assistant reply for regeneration: finds the user turn it answered,
 * rejects older replies (which would discard newer conversation), then removes the reply
 * and any tool steps that followed. The caller re-runs the turn without appending the user
 * message again.
 */
export async function prepareRegeneration(
  db: DbContext,
  sessionId: string,
  assistantMessageId: string,
): Promise<RegenerationTarget | null> {
  const messages = createMessageRepository(db);
  const history = await messages.list(sessionId, { limit: 200 });
  const index = history.findIndex((message) => message.id === assistantMessageId);
  const target = history[index];
  if (index < 0 || !target || target.role !== "assistant") {
    return null;
  }
  if (!target.providerId || !target.modelId) {
    return null;
  }
  if (history.slice(index + 1).some((message) => message.role === "user")) {
    return null;
  }
  const user = lastUserBefore(history, index);
  if (!user) {
    return null;
  }
  await messages.removeAfter(sessionId, user.seq);
  return {
    selectionId: `${target.providerId}:${target.modelId}`,
    effort: target.effort ?? "Standard",
    text: textOf(user),
  };
}

function lastUserBefore(
  history: readonly MessageWithParts[],
  index: number,
): MessageWithParts | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = history[cursor];
    if (message?.role === "user") {
      return message;
    }
  }
  return null;
}

function textOf(message: MessageWithParts): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map(textOfPart)
    .join("");
}

function textOfPart(part: Part): string {
  const data = part.data;
  if (typeof data === "object" && data !== null && "text" in data) {
    const value = (data as { text: unknown }).text;
    return typeof value === "string" ? value : "";
  }
  return "";
}
