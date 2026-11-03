import { DatabaseSync } from "node:sqlite";

import { createDbContext } from "../context";
import { migrate } from "../migrations";
import type { DbContext, SqlCommand, SqlDatabase, SqlValue } from "../types";

export function createNodeDatabase(): SqlDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const statement = db.prepare(sql);
      if (isRead(sql)) {
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
          if (isRead(sql)) {
            statement.all(...params);
          } else {
            statement.run(...params);
          }
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

export async function createTestContext(): Promise<DbContext> {
  const db = createNodeDatabase();
  await migrate(db);
  let sequence = 0;
  let timestamp = 1_700_000_000_000;
  return createDbContext(db, {
    ids: () => `id-${(sequence += 1)}`,
    now: () => (timestamp += 1_000),
  });
}

export async function withContext(run: (ctx: DbContext) => Promise<void>): Promise<void> {
  const ctx = await createTestContext();
  try {
    await run(ctx);
  } finally {
    await ctx.db.close();
  }
}

function isRead(sql: string): boolean {
  return /^\s*(select|pragma|with)\b/i.test(sql);
}
