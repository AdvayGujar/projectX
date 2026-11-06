import type { ArtifactSummary, ModelInfo } from "@projectx/core";

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

const ARTIFACT_LABELS = {
  deck: "Deck",
  sheet: "Sheet",
  doc: "Doc",
} satisfies Record<ArtifactSummary["kind"], string>;

/**
 * The system text for a turn: guidance, retrieved library chunks, and the artifact catalog.
 * Sections are omitted when empty, so a standalone chat or an empty project gets no prompt.
 */
export function composeSystemPrompt(
  instructions: string | null | undefined,
  libraryText: string | null | undefined = "",
  artifacts: readonly ArtifactSummary[] = [],
): string {
  const sections: string[] = [];
  const guidance = instructions?.trim() ?? "";
  if (guidance.length > 0) {
    sections.push(`Project instructions:\n${guidance}`);
  }
  const library = libraryText?.trim() ?? "";
  if (library.length > 0) {
    sections.push(`Project library:\n${library}`);
  }
  if (artifacts.length > 0) {
    const lines = artifacts.map(
      (artifact) =>
        `- ${ARTIFACT_LABELS[artifact.kind]}: ${artifact.title} (v${artifact.currentVersion})`,
    );
    sections.push(`Project artifacts:\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
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
