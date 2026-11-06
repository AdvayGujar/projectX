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

/** A page, slide, or section the assistant actually read. */
export interface CitationRef {
  readonly fileId: string;
  readonly fileName: string;
  readonly fileKind: "pdf" | "docx" | "xlsx" | "pptx" | "image" | "text" | "other";
  readonly page: number | null;
  readonly section: string | null;
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
  readonly citations?: readonly CitationRef[];
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
  /** False means the model reasons even when the user turns Think off. */
  readonly canDisableReasoning: boolean;
  /** The effort levels this model actually accepts, in display order. */
  readonly reasoningEfforts: readonly ReasoningEffort[];
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

/** Effort levels a reasoning model can expose; each picker shows its own subset. */
export const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface RecentSession {
  readonly id: string;
  readonly title: string;
}
