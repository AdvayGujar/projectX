import type { TurnSink, TurnUsage } from "../services/turnPort";
import { useSessionStore } from "./sessionStore";
import { useSessionsStore } from "./sessionsStore";

/**
 * The default consumer of the turn port: writes into the Zustand stores. A different shell
 * would provide its own sink instead of importing this file.
 */
export function createSessionStoreSink(): TurnSink {
  return {
    onUserTurn: (id, text, attachments) => {
      const store = useSessionStore.getState();
      store.setStreaming(true);
      store.addTurn({
        id,
        role: "user",
        text,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      });
    },

    onAssistantStart: (id, reasoningRequested) => {
      useSessionStore.getState().setStreaming(true);
      useSessionStore.getState().addTurn({
        id,
        role: "assistant",
        text: "",
        status: "streaming",
        reasoningRequested,
      });
    },

    onText: (id, text) => {
      useSessionStore.getState().appendText(id, text);
    },

    onReasoning: (id, text) => {
      useSessionStore.getState().appendReasoning(id, text);
    },

    onUsage: (id, usage) => {
      const store = useSessionStore.getState();
      store.setCost(id, toCost(usage));
      store.addUsage({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
      });
    },

    onSettled: () => {
      const store = useSessionStore.getState();
      store.settleStreaming();
      store.setStreaming(false);
      void useSessionsStore.getState().refresh();
    },

    onError: (message) => {
      useSessionStore.getState().setError(message);
    },
  };
}

function toCost(usage: TurnUsage) {
  return {
    model: usage.model,
    effort: usage.effort,
    tokens: `${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`,
    ...(usage.costUsd === null ? {} : { usd: `$${usage.costUsd.toFixed(4)}` }),
  };
}
