import type { TurnCost, ViewTurn } from "@projectx/ui";
import { create } from "zustand";

interface SessionState {
  readonly activeSessionId: string | null;
  readonly title: string;
  readonly turns: readonly ViewTurn[];
  readonly streaming: boolean;
  readonly error: string | null;
  readonly beginSession: (sessionId: string, title: string, turns: readonly ViewTurn[]) => void;
  readonly resetSession: (sessionId: string) => void;
  readonly addTurn: (turn: ViewTurn) => void;
  readonly appendText: (id: string, text: string) => void;
  readonly appendReasoning: (id: string, text: string) => void;
  readonly setCost: (id: string, cost: TurnCost) => void;
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

  beginSession: (sessionId, title, turns) =>
    set({ activeSessionId: sessionId, title, turns, streaming: false, error: null }),

  resetSession: (sessionId) =>
    set({ activeSessionId: sessionId, title: "", turns: [], streaming: false, error: null }),

  addTurn: (turn) => set((state) => ({ turns: [...state.turns, turn] })),

  appendText: (id, text) =>
    set((state) => ({ turns: update(state.turns, id, (turn) => ({ ...turn, text: turn.text + text })) })),

  appendReasoning: (id, text) =>
    set((state) => ({
      turns: update(state.turns, id, (turn) => ({
        ...turn,
        reasoning: (turn.reasoning ?? "") + text,
      })),
    })),

  setCost: (id, cost) =>
    set((state) => ({ turns: update(state.turns, id, (turn) => ({ ...turn, cost })) })),

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
