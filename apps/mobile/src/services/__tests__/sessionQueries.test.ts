import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";

import {
  createDbContext,
  createMessageRepository,
  createSessionRepository,
  migrate,
} from "@projectx/core";
import type { DbContext, SqlCommand, SqlDatabase, SqlValue } from "@projectx/core";

jest.mock("../../db/client", () => ({ getDbContext: jest.fn() }));

import { getDbContext } from "../../db/client";
import { loadSession } from "../sessionQueries";

function createNodeDatabase(): SqlDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const statement = db.prepare(sql);
      if (/^\s*select\b/i.test(sql)) {
        const rows = statement.all(...params) as Array<Record<string, SqlValue>>;
        return { rows: rows.map((row) => ({ ...row })) };
      }
      statement.run(...params);
      return { rows: [] };
    },
    async executeBatch(commands: SqlCommand[]) {
      db.exec("BEGIN");
      try {
        for (const [sql, params = []] of commands) {
          const statement = db.prepare(sql);
          statement.run(...params);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      db.close();
    },
  };
}

let ctx: DbContext;

beforeEach(async () => {
  const db = createNodeDatabase();
  await migrate(db);
  let sequence = 0;
  ctx = createDbContext(db, {
    ids: () => `id-${(sequence += 1)}`,
    now: () => 1_700_000_000_000 + sequence,
  });
  jest.mocked(getDbContext).mockResolvedValue(ctx);
});

describe("loadSession", () => {
  it("folds a tool round into the assistant turn that follows it", async () => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "How did revenue change?" } }],
    });
    await messages.append({
      sessionId: session.id,
      role: "assistant",
      providerId: "provider-1",
      modelId: "model-1",
      parts: [{
        type: "tool_call",
        data: { id: "call-1", name: "read_document", arguments: { fileId: "f1" }, role: "read" },
      }],
    });
    await messages.append({
      sessionId: session.id,
      role: "tool",
      parts: [{
        type: "tool_result",
        data: {
          toolCallId: "call-1",
          name: "read_document",
          content: "Revenue grew.",
          display: "report.pdf · 2 pages",
          role: "read",
        },
      }],
    });
    const final = await messages.append({
      sessionId: session.id,
      role: "assistant",
      providerId: "provider-1",
      modelId: "model-1",
      usage: { inputTokens: 10, outputTokens: 2 },
      parts: [{ type: "text", data: { text: "Revenue grew by 12%." } }],
    });

    const loaded = await loadSession(session.id);

    expect(loaded?.turns).toHaveLength(2);
    const assistant = loaded?.turns[1];
    expect(assistant?.id).toBe(final.id);
    expect(assistant?.text).toBe("Revenue grew by 12%.");
    expect(assistant?.activity).toEqual([
      { kind: "read", tool: "read_document", detail: "report.pdf · 2 pages" },
    ]);
    expect(assistant?.cost?.tokens).toBe("10 in / 2 out");
  });
});
