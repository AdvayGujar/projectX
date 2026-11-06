export type SqlValue = string | number | null;
export type SqlCommand = [sql: string, params?: SqlValue[]];

export interface QueryResult {
  rows: Array<Record<string, SqlValue>>;
}

export interface SqlDatabase {
  execute(sql: string, params?: SqlValue[]): Promise<QueryResult>;
  executeBatch(commands: SqlCommand[]): Promise<void>;
  close(): Promise<void>;
}

export type IdFactory = () => string;
export type Clock = () => number;

export interface DbContext {
  db: SqlDatabase;
  ids: IdFactory;
  now: Clock;
}

export interface Migration {
  version: number;
  name: string;
  statements: string[];
  /**
   * A table rebuild that drops a parent table would cascade through its children while
   * foreign keys are enforced. "off" disables them for the whole migration batch.
   */
  foreignKeys?: "off";
}

export type FileKind = "pdf" | "docx" | "xlsx" | "pptx" | "image" | "text" | "other";

/** A file belongs to exactly one owner: a standalone session, or a project library. */
export interface FileRecord {
  id: string;
  sessionId: string | null;
  projectId: string | null;
  name: string;
  mime: string;
  size: number;
  path: string;
  kind: FileKind;
  createdAt: number;
}

export type DocumentStatus = "pending" | "extracting" | "ready" | "error";

export interface DocumentRecord {
  id: string;
  fileId: string;
  pageCount: number | null;
  slideCount: number | null;
  sheetCount: number | null;
  status: DocumentStatus;
  error: string | null;
  extractedAt: number | null;
}

export type ArtifactKind = "deck" | "sheet" | "doc";

/** An artifact keeps a project home, a session origin, or both after a chat is deleted. */
export interface ArtifactRecord {
  id: string;
  sessionId: string | null;
  projectId: string | null;
  kind: ArtifactKind;
  title: string;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactVersionRecord {
  artifactId: string;
  version: number;
  specJson: string;
  createdBy: "model" | "user";
  createdAt: number;
}

/** The catalog entry a chat prompt can show without loading the spec. */
export interface ArtifactSummary {
  id: string;
  kind: ArtifactKind;
  title: string;
  currentVersion: number;
}

export type ProjectLinkStatus = "pending" | "fetching" | "ready" | "error";

/** A saved web link in a project library; its summary snapshot is a project-owned file. */
export interface ProjectLink {
  id: string;
  projectId: string;
  url: string;
  title: string;
  mediaType: string | null;
  snapshotFileId: string | null;
  status: ProjectLinkStatus;
  error: string | null;
  fetchedAt: number | null;
  createdAt: number;
}

export interface DocChunk {
  id: string;
  documentId: string;
  ordinal: number;
  page: number | null;
  section: string | null;
  text: string;
  tokenEstimate: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "streaming" | "done" | "aborted" | "error";
export type PartType =
  | "text"
  | "reasoning"
  | "tool_call"
  | "tool_result"
  | "attachment"
  | "artifact"
  | "error";

export interface Project {
  id: string;
  name: string;
  icon: string | null;
  instructions: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  projectId: string | null;
  title: string;
  providerId: string | null;
  modelId: string | null;
  summary: string | null;
  summaryUptoSeq: number | null;
  pinned: boolean;
  archived: boolean;
  lastMessageAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  sessionId: string;
  seq: number;
  role: MessageRole;
  providerId: string | null;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  costUsd: number | null;
  effort: string | null;
  /** Hidden from transcript and context, but still counted in session spend. */
  superseded: boolean;
  status: MessageStatus;
  createdAt: number;
}

export interface Part {
  id: string;
  messageId: string;
  seq: number;
  type: PartType;
  data: unknown;
  createdAt: number;
}

export type MessageWithParts = Message & { parts: Part[] };

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
}
