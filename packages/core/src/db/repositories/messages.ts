import { AppError } from "../../errors";
import type {
  DbContext,
  Message,
  MessageRole,
  MessageStatus,
  MessageWithParts,
  Part,
  PartType,
  SqlCommand,
  SqlDatabase,
  SqlValue,
  Usage,
} from "../types";
import { toDbError } from "./errors";

interface MessageRow {
  id: string;
  session_id: string;
  seq: number;
  role: MessageRole;
  provider_id: string | null;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cost_usd: number | null;
  status: MessageStatus;
  created_at: number;
}

interface PartRow {
  id: string;
  message_id: string;
  seq: number;
  type: PartType;
  data_json: string;
  created_at: number;
}

export interface PartInput {
  type: PartType;
  data: unknown;
  searchText?: string | null;
}

export interface AppendMessageInput {
  sessionId: string;
  role: MessageRole;
  providerId?: string | null;
  modelId?: string | null;
  status?: MessageStatus;
  parts: PartInput[];
  usage?: Usage;
}

export interface ListMessagesOptions {
  limit?: number;
  beforeSeq?: number | null;
}

export interface UpdatePartInput {
  data?: unknown;
  searchText?: string | null;
}

const MESSAGE_COLUMNS = "id, session_id, seq, role, provider_id, model_id, input_tokens, output_tokens, cached_tokens, cost_usd, status, created_at";
const PART_COLUMNS = "id, message_id, seq, type, data_json, search_text, created_at";

export function createMessageRepository({ db, ids, now }: DbContext) {
  return {
    async append(input: AppendMessageInput): Promise<MessageWithParts> {
      const createdAt = now();
      const seq = await nextSeq(db, input.sessionId, "messages");
      const message: Message = {
        id: ids(),
        sessionId: input.sessionId,
        seq,
        role: input.role,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        inputTokens: input.usage?.inputTokens ?? null,
        outputTokens: input.usage?.outputTokens ?? null,
        cachedTokens: input.usage?.cachedTokens ?? null,
        costUsd: input.usage?.costUsd ?? null,
        status: input.status ?? "done",
        createdAt,
      };
      const created = input.parts.map((part, index) => ({
        part: buildPart(part, message.id, index + 1, ids(), createdAt),
        searchText: part.searchText ?? null,
      }));
      const parts = created.map((entry) => entry.part);
      const commands: SqlCommand[] = [
        insertMessageCommand(message),
        ...created.map((entry) => insertPartCommand(entry.part, entry.searchText)),
        ["UPDATE sessions SET last_message_at = ?, updated_at = ? WHERE id = ?", [createdAt, createdAt, input.sessionId]],
      ];
      try {
        await db.executeBatch(commands);
      } catch (error) {
        throw toDbError(error, "Could not save message.");
      }
      return { ...message, parts };
    },

    async appendPart(messageId: string, input: PartInput): Promise<Part> {
      const createdAt = now();
      const seq = await nextSeq(db, messageId, "parts", "message_id");
      const part = buildPart(input, messageId, seq, ids(), createdAt);
      try {
        await db.execute(
          `INSERT INTO parts (${PART_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          partParams(part, input.searchText ?? null),
        );
      } catch (error) {
        throw toDbError(error, "Could not save message part.");
      }
      return part;
    },

    async updatePart(partId: string, patch: UpdatePartInput): Promise<void> {
      const fields: string[] = [];
      const params: SqlValue[] = [];
      if (patch.data !== undefined) {
        fields.push("data_json = ?");
        params.push(JSON.stringify(patch.data));
      }
      if (patch.searchText !== undefined) {
        fields.push("search_text = ?");
        params.push(patch.searchText);
      }
      if (fields.length === 0) {
        return;
      }
      await db.execute(`UPDATE parts SET ${fields.join(", ")} WHERE id = ?`, [...params, partId]);
    },

    async updateStatus(messageId: string, status: MessageStatus, usage: Usage = {}): Promise<void> {
      const fields = ["status = ?"];
      const params: SqlValue[] = [status];
      appendNullable(fields, params, "input_tokens", usage.inputTokens);
      appendNullable(fields, params, "output_tokens", usage.outputTokens);
      appendNullable(fields, params, "cached_tokens", usage.cachedTokens);
      appendNullable(fields, params, "cost_usd", usage.costUsd);
      await db.execute(`UPDATE messages SET ${fields.join(", ")} WHERE id = ?`, [...params, messageId]);
    },

    async list(sessionId: string, options: ListMessagesOptions = {}): Promise<MessageWithParts[]> {
      const limit = clamp(options.limit ?? 50, 1, 200);
      const before = options.beforeSeq ?? null;
      const result = before === null
        ? await db.execute(
          "SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?",
          [sessionId, limit],
        )
        : await db.execute(
          "SELECT * FROM messages WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
          [sessionId, before, limit],
        );
      const messages = result.rows.map((row) => mapMessage(row as unknown as MessageRow));
      if (messages.length === 0) {
        return [];
      }
      const parts = await loadParts(db, messages.map((message) => message.id));
      return messages
        .reverse()
        .map((message) => ({ ...message, parts: parts.get(message.id) ?? [] }));
    },

    async get(id: string): Promise<MessageWithParts | null> {
      const result = await db.execute(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ?`, [id]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const parts = await loadParts(db, [id]);
      return { ...mapMessage(row as unknown as MessageRow), parts: parts.get(id) ?? [] };
    },

    async count(sessionId: string): Promise<number> {
      const result = await db.execute(
        "SELECT COUNT(*) AS count FROM messages WHERE session_id = ?",
        [sessionId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },
  };
}

export type MessageRepository = ReturnType<typeof createMessageRepository>;

function buildPart(input: PartInput, messageId: string, seq: number, id: string, createdAt: number): Part {
  return { id, messageId, seq, type: input.type, data: input.data ?? null, createdAt };
}

function insertMessageCommand(message: Message): SqlCommand {
  return [
    `INSERT INTO messages (${MESSAGE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id, message.sessionId, message.seq, message.role,
      message.providerId, message.modelId, message.inputTokens,
      message.outputTokens, message.cachedTokens, message.costUsd,
      message.status, message.createdAt,
    ],
  ];
}

function insertPartCommand(part: Part, searchText: string | null): SqlCommand {
  return [
    `INSERT INTO parts (${PART_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    partParams(part, searchText),
  ];
}

function partParams(part: Part, searchText: string | null): SqlValue[] {
  return [
    part.id, part.messageId, part.seq, part.type,
    JSON.stringify(part.data ?? null), searchText, part.createdAt,
  ];
}

async function loadParts(db: SqlDatabase, messageIds: string[]): Promise<Map<string, Part[]>> {
  const placeholders = messageIds.map(() => "?").join(", ");
  const result = await db.execute(
    `SELECT ${PART_COLUMNS} FROM parts WHERE message_id IN (${placeholders}) ORDER BY message_id, seq`,
    messageIds,
  );
  const byMessage = new Map<string, Part[]>();
  for (const row of result.rows) {
    const part = mapPart(row as unknown as PartRow);
    const list = byMessage.get(part.messageId) ?? [];
    list.push(part);
    byMessage.set(part.messageId, list);
  }
  return byMessage;
}

async function nextSeq(
  db: SqlDatabase,
  id: string,
  table: "messages" | "parts",
  column = "session_id",
): Promise<number> {
  const result = await db.execute(
    `SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM ${table} WHERE ${column} = ?`,
    [id],
  );
  return Number(result.rows[0]?.seq ?? 1);
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    seq: Number(row.seq),
    role: row.role,
    providerId: row.provider_id,
    modelId: row.model_id,
    inputTokens: nullableNumber(row.input_tokens),
    outputTokens: nullableNumber(row.output_tokens),
    cachedTokens: nullableNumber(row.cached_tokens),
    costUsd: nullableNumber(row.cost_usd),
    status: row.status,
    createdAt: Number(row.created_at),
  };
}

function mapPart(row: PartRow): Part {
  return {
    id: row.id,
    messageId: row.message_id,
    seq: Number(row.seq),
    type: row.type,
    data: parseJson(row.data_json),
    createdAt: Number(row.created_at),
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new AppError("db_invalid", "Stored part data is not valid JSON", { cause: error });
  }
}

function appendNullable(
  fields: string[],
  params: SqlValue[],
  column: string,
  value: number | undefined,
): void {
  if (value !== undefined) {
    fields.push(`${column} = ?`);
    params.push(value);
  }
}

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
