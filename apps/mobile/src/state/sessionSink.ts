import type { TurnSink, TurnUsage } from "../services/turnPort";
import { useSessionStore } from "./sessionStore";
import { useSessionsStore } from "./sessionsStore";

interface AccumulatedUsage {
  model: string;
  effort: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  costComplete: boolean;
}

/**
 * The default consumer of the turn port: writes into the Zustand stores. A multi-step turn
 * is one transcript row; the sink remaps later assistant messages onto the first row's id
 * and adopts the final message id when the turn ends.
 */
export function createSessionStoreSink(): TurnSink {
  let activeViewId: string | null = null;
  const viewByMessage = new Map<string, string>();
  const usageByView = new Map<string, AccumulatedUsage>();

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

    onAssistantStart: (id, reasoningRequested, step) => {
      const store = useSessionStore.getState();
      if (step === 1 || activeViewId === null) {
        activeViewId = id;
        store.setStreaming(true);
        store.addTurn({
          id,
          role: "assistant",
          text: "",
          status: "streaming",
          reasoningRequested,
        });
      }
      viewByMessage.set(id, activeViewId);
    },

    onText: (id, text) => {
      useSessionStore.getState().appendText(viewOf(id), text);
    },

    onReasoning: (id, text) => {
      useSessionStore.getState().appendReasoning(viewOf(id), text);
    },

    onToolActivity: (id, activity) => {
      useSessionStore.getState().addActivity(viewOf(id), activity);
    },

    onUsage: (id, usage) => {
      const viewId = viewOf(id);
      const total = accumulate(viewId, usage);
      const store = useSessionStore.getState();
      store.setCost(viewId, toCost(total));
      store.addUsage({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
      });
    },

    onTurnFinished: (id) => {
      if (!id || !activeViewId || id === activeViewId) {
        return;
      }
      const previous = activeViewId;
      useSessionStore.getState().adoptTurnId(previous, id);
      for (const [messageId, viewId] of viewByMessage) {
        if (viewId === previous) {
          viewByMessage.set(messageId, id);
        }
      }
      const usage = usageByView.get(previous);
      if (usage) {
        usageByView.delete(previous);
        usageByView.set(id, usage);
      }
      activeViewId = id;
    },

    onSettled: () => {
      const store = useSessionStore.getState();
      store.settleStreaming();
      store.setStreaming(false);
      activeViewId = null;
      viewByMessage.clear();
      usageByView.clear();
      void useSessionsStore.getState().refresh();
    },

    onError: (message) => {
      useSessionStore.getState().setError(message);
    },
  };

  function viewOf(messageId: string): string {
    return viewByMessage.get(messageId) ?? messageId;
  }

  function accumulate(viewId: string, usage: TurnUsage): AccumulatedUsage {
    const previous = usageByView.get(viewId);
    const next: AccumulatedUsage = {
      model: usage.model,
      effort: usage.effort,
      inputTokens: (previous?.inputTokens ?? 0) + usage.inputTokens,
      outputTokens: (previous?.outputTokens ?? 0) + usage.outputTokens,
      costUsd:
        usage.costUsd === null
          ? previous?.costUsd ?? null
          : (previous?.costUsd ?? 0) + usage.costUsd,
      costComplete: (previous?.costComplete ?? true) && usage.costUsd !== null,
    };
    usageByView.set(viewId, next);
    return next;
  }
}

function toCost(usage: AccumulatedUsage) {
  return {
    model: usage.model,
    effort: usage.effort,
    tokens: `${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`,
    ...(usage.costComplete && usage.costUsd !== null
      ? { usd: `$${usage.costUsd.toFixed(4)}` }
      : {}),
  };
}
