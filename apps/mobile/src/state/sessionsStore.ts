import { create } from "zustand";

import { listSessions } from "../services/sessionQueries";
import type { SessionSummary } from "../services/sessionQueries";

interface SessionsState {
  readonly sessions: readonly SessionSummary[];
  readonly refresh: () => Promise<void>;
}

/** Recent chats for the drawer. Refreshed after a turn and when the app opens. */
export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  refresh: async () => {
    try {
      set({ sessions: await listSessions() });
    } catch {
      // The drawer keeps its last list; the failure surfaces on the chat screen instead.
    }
  },
}));
