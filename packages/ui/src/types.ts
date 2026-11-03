import type { IconName } from "./icons";

/** View models. `packages/ui` renders these; it never reads storage or a provider. */

export type TurnRole = "user" | "assistant";

export interface ToolActivity {
  readonly kind: "read" | "wrote";
  readonly tool: string;
  readonly detail: string;
}

export interface SourceRef {
  readonly title: string;
  readonly domain: string;
}

export interface TurnCost {
  readonly model: string;
  readonly effort: string;
  readonly tokens: string;
  readonly usd: string;
}

export interface TurnArtifact {
  readonly title: string;
  readonly subtitle: string;
}

export interface ViewTurn {
  readonly id: string;
  readonly role: TurnRole;
  readonly text: string;
  readonly reasoning?: string;
  readonly activity?: readonly ToolActivity[];
  readonly artifact?: TurnArtifact;
  readonly sources?: readonly SourceRef[];
  readonly cost?: TurnCost;
}

export interface DrawerDestination {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
}

/** One selectable model, flattened across providers for the picker. */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly effort: string;
  readonly reasoning: boolean;
}

/** A file picked in the composer. Not yet uploaded or sent. */
export interface AttachmentChip {
  readonly id: string;
  readonly name: string;
}

/** Effort levels offered after choosing a reasoning-capable model. */
export const REASONING_EFFORTS = ["Low", "Medium", "High"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface RecentSession {
  readonly id: string;
  readonly title: string;
}
