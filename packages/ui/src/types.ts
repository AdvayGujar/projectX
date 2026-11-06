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
  readonly effort?: string;
  readonly tokens: string;
  readonly usd?: string;
}

export interface TurnArtifact {
  readonly title: string;
  readonly subtitle: string;
}

/** What was attached to a user turn. The bytes stay in storage, not in the transcript. */
export interface TurnAttachment {
  /** Position among the message's attachment parts, used to fetch the bytes lazily. */
  readonly index: number;
  readonly name: string;
  readonly mimeType: string;
  readonly kind: "image" | "document";
}

export type TurnViewStatus = "streaming" | "done" | "error";

export interface ViewTurn {
  readonly id: string;
  readonly role: TurnRole;
  readonly text: string;
  readonly attachments?: readonly TurnAttachment[];
  /** Absent means a stored turn, which is always finished. */
  readonly status?: TurnViewStatus;
  /** False when the turn ran with Think off, so reasoning is not shown. */
  readonly reasoningRequested?: boolean;
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
  readonly vision: boolean;
  /** Whether the model can call the read tools that open attached documents. */
  readonly tools: boolean;
}

/** A file picked in the composer. Images become vision input; documents wait for extraction. */
export interface AttachmentChip {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly kind: "image" | "document";
  readonly size: number | null;
}

/** Effort levels offered after choosing a reasoning-capable model. */
export const REASONING_EFFORTS = ["Low", "Medium", "High"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface RecentSession {
  readonly id: string;
  readonly title: string;
}
