import type { ModelOption } from "@projectx/ui";
import { create } from "zustand";

/**
 * Placeholder model list. Real options come from `models_cache` once the provider
 * screens exist; the store shape should survive that swap.
 */
export const MODELS: readonly ModelOption[] = [
  { id: "anthropic/claude-sonnet-4.5", label: "Sonnet 4.5", provider: "Anthropic", effort: "High" },
  { id: "openai/gpt-5.1", label: "GPT-5.1", provider: "OpenAI", effort: "Medium" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3.2", provider: "DeepSeek", effort: "Standard" },
  { id: "google/gemini-3-pro", label: "Gemini 3 Pro", provider: "Google", effort: "High" },
];

const DEFAULT_MODEL: ModelOption = MODELS[0] ?? {
  id: "anthropic/claude-sonnet-4.5",
  label: "Sonnet 4.5",
  provider: "Anthropic",
  effort: "High",
};

interface ModelState {
  readonly current: ModelOption;
  readonly select: (model: ModelOption) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  current: DEFAULT_MODEL,
  select: (current) => set({ current }),
}));
