import { mergeCitations } from "@projectx/core";
import type { CitationRef, ToolActivity, TurnCost, ViewTurn } from "@projectx/ui";
import { create } from "zustand";

export interface SessionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number | null;
  readonly costComplete: boolean;
}

export const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  costComplete: true,
};

interface SessionState {
  readonly activeSessionId: string | null;
  readonly title: string;
  readonly turns: readonly ViewTurn[];
  readonly streaming: boolean;
  readonly error: string | null;
  readonly usage: SessionUsage;
  readonly beginSession: (
    sessionId: string,
    title: string,
    turns: readonly ViewTurn[],
    usage?: SessionUsage,
  ) => void;
  readonly resetSession: (sessionId: string) => void;
  readonly setTitle: (title: string) => void;
  readonly addTurn: (turn: ViewTurn) => void;
  readonly addUsage: (input: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly costUsd?: number | null;
  }) => void;
  readonly appendText: (id: string, text: string) => void;
  readonly appendReasoning: (id: string, text: string) => void;
  readonly addActivity: (id: string, activity: ToolActivity) => void;
  readonly addCitations: (id: string, citations: readonly CitationRef[]) => void;
  readonly setCost: (id: string, cost: TurnCost) => void;
  readonly adoptTurnId: (fromId: string, toId: string) => void;
  readonly settleStreaming: () => void;
  readonly setStreaming: (value: boolean) => void;
  readonly setError: (message: string | null) => void;
}

/**
 * Transcript state for the open session. `TurnService` is the only writer while a turn is
 * running; screens read through selectors (plan §7).
 */
export const useSessionStore = create<SessionState>((set) => ({
  activeSessionId: null,
  title: "",
  turns: [],
  streaming: false,
  error: null,
  usage: EMPTY_USAGE,

  beginSession: (sessionId, title, turns, usage = EMPTY_USAGE) =>
    set({ activeSessionId: sessionId, title, turns, streaming: false, error: null, usage }),

  resetSession: (sessionId) =>
    set({
      activeSessionId: sessionId,
      title: "",
      turns: [],
      streaming: false,
      error: null,
      usage: EMPTY_USAGE,
    }),

  setTitle: (title) => set({ title }),

  addTurn: (turn) => set((state) => ({ turns: [...state.turns, turn] })),

  addUsage: (input) =>
    set((state) => ({
      usage: {
        inputTokens: state.usage.inputTokens + (input.inputTokens ?? 0),
        outputTokens: state.usage.outputTokens + (input.outputTokens ?? 0),
        costUsd:
          input.costUsd == null
            ? state.usage.costUsd
            : (state.usage.costUsd ?? 0) + input.costUsd,
        costComplete: state.usage.costComplete && input.costUsd != null,
      },
    })),

  appendText: (id, text) =>
    set((state) => ({ turns: update(state.turns, id, (turn) => ({ ...turn, text: turn.text + text })) })),

  appendReasoning: (id, text) =>
    set((state) => ({
      turns: update(state.turns, id, (turn) => ({
        ...turn,
        reasoning: (turn.reasoning ?? "") + text,
      })),
    })),

  addActivity: (id, activity) =>
    set((state) => ({
      turns: update(state.turns, id, (turn) => ({
        ...turn,
        activity: [...(turn.activity ?? []), activity],
      })),
    })),

  addCitations: (id, citations) =>
    set((state) => ({
      turns: update(state.turns, id, (turn) => ({
        ...turn,
        citations: mergeCitations(turn.citations ?? [], citations),
      })),
    })),

  setCost: (id, cost) =>
    set((state) => ({ turns: update(state.turns, id, (turn) => ({ ...turn, cost })) })),

  adoptTurnId: (fromId, toId) =>
    set((state) => ({
      turns: state.turns.map((turn) => (turn.id === fromId ? { ...turn, id: toId } : turn)),
    })),

  settleStreaming: () =>
    set((state) => ({
      turns: state.turns.map((turn) =>
        turn.status === "streaming" ? { ...turn, status: "done" as const } : turn,
      ),
    })),

  setStreaming: (value) => set({ streaming: value }),
  setError: (message) => set({ error: message }),
}));

function update(
  turns: readonly ViewTurn[],
  id: string,
  change: (turn: ViewTurn) => ViewTurn,
): readonly ViewTurn[] {
  return turns.map((turn) => (turn.id === id ? change(turn) : turn));
}
