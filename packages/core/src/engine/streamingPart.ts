import type { MessageRepository } from "../db";

export interface StreamingPart {
  partId: string | null;
  text: string;
  lastFlush: number;
}

export function createStreamingPart(): StreamingPart {
  return { partId: null, text: "", lastFlush: 0 };
}

export async function appendStreamingText(
  repository: MessageRepository,
  messageId: string,
  state: StreamingPart,
  type: "text" | "reasoning",
  delta: string,
  now: number,
  flushIntervalMs = 250,
): Promise<void> {
  state.text += delta;
  if (state.partId === null || now - state.lastFlush >= flushIntervalMs) {
    await flushStreamingPart(repository, messageId, state, type, now);
  }
}

export async function flushStreamingPart(
  repository: MessageRepository,
  messageId: string,
  state: StreamingPart,
  type: "text" | "reasoning",
  now: number,
): Promise<void> {
  if (state.partId === null && state.text.length === 0) {
    return;
  }
  const searchText = type === "text" ? state.text : null;
  if (state.partId === null) {
    const part = await repository.appendPart(messageId, {
      type,
      data: { text: state.text },
      searchText,
    });
    state.partId = part.id;
  } else {
    await repository.updatePart(state.partId, {
      data: { text: state.text },
      searchText,
    });
  }
  state.lastFlush = now;
}
