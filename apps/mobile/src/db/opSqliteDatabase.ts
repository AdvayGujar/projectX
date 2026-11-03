import { open, type SQLBatchTuple } from "@op-engineering/op-sqlite";
import type { QueryResult, SqlCommand, SqlDatabase, SqlValue } from "@projectx/core";

export async function createOpSqliteDatabase(name: string): Promise<SqlDatabase> {
  const database = open({ name });
  await database.execute("PRAGMA foreign_keys = ON");
  await database.execute("PRAGMA journal_mode = WAL");

  return {
    async execute(sql: string, params: SqlValue[] = []): Promise<QueryResult> {
      const result = await database.execute(sql, params);
      return { rows: (result.rows ?? []) as Array<Record<string, SqlValue>> };
    },

    async executeBatch(commands: SqlCommand[]): Promise<void> {
      const batch: SQLBatchTuple[] = commands.map(([sql, params]) =>
        params ? [sql, params] : [sql],
      );
      await database.executeBatch(batch);
    },

    async close(): Promise<void> {
      database.close();
    },
  };
}
