import type { ModelOption } from "@projectx/ui";
import { normalizeReasoningEffort } from "@projectx/core";
import { create } from "zustand";

/**
 * Models come from `models_cache`, filled when a provider key is validated. The store holds
 * only the choice: which model answers, and at what effort (D11 — the user decides).
 */
interface ModelState {
  readonly models: readonly ModelOption[];
  readonly current: ModelOption | null;
  readonly setModels: (models: readonly ModelOption[]) => void;
  readonly select: (model: ModelOption, effort: string) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  current: null,
  setModels: (models) =>
    set((state) => {
      const refreshed = models.find((model) => model.id === state.current?.id);
      const current = refreshed
        ? { ...refreshed, effort: reconcileEffort(refreshed, state.current?.effort) }
        : (models[0] ?? null);
      return { models, current };
    }),
  select: (model, effort) =>
    set({
      current: { ...model, effort: reconcileEffort(model, effort) },
    }),
}));

/** A refreshed catalog can drop an effort level the old selection still names. */
function reconcileEffort(model: ModelOption, effort: string | undefined): string {
  const normalized = normalizeReasoningEffort(effort);
  if (normalized && model.reasoningEfforts.includes(normalized)) {
    return normalized;
  }
  return model.effort;
}
