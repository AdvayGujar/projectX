import type { ModelInfo } from "@projectx/core";

/** Pure helpers behind the turn port, kept free of React Native for testing. */

export interface SelectionRef {
  readonly providerId: string;
  readonly modelId: string;
}

/** Model selections are keyed `providerRowId:modelId`. */
export function parseSelectionId(id: string): SelectionRef | null {
  const separator = id.indexOf(":");
  if (separator <= 0 || separator === id.length - 1) {
    return null;
  }
  return { providerId: id.slice(0, separator), modelId: id.slice(separator + 1) };
}

/** Project guidance is the only system text a turn carries until memory lands (M2.3c). */
export function composeSystemPrompt(instructions: string | null | undefined): string {
  const trimmed = instructions?.trim() ?? "";
  return trimmed.length === 0 ? "" : `Project instructions:\n${trimmed}`;
}

export interface PricedTurn {
  readonly model: string;
  readonly effort: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Null when neither the provider nor the catalog supplies a price. */
  readonly costUsd: number | null;
}

export function priceTurn(
  usage: { readonly inputTokens?: number; readonly outputTokens?: number; readonly costUsd?: number },
  model: Pick<ModelInfo, "label" | "pricing">,
  effort: string,
): PricedTurn {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const costUsd =
    usage.costUsd ??
    (model.pricing
      ? (inputTokens * model.pricing.input + outputTokens * model.pricing.output) / 1_000_000
      : null);

  return { model: model.label, effort, inputTokens, outputTokens, costUsd };
}
