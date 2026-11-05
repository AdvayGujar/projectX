import type { SqlCommand, SqlDatabase, SqlValue, Migration } from "../types";
import { initialMigration } from "./001-initial";
import { messageEffortMigration } from "./002-message-effort";
import { messageSupersededMigration } from "./003-message-superseded";
import { sessionScopedFilesMigration } from "./004-session-scoped-files";

const migrations: Migration[] = [
  initialMigration,
  messageEffortMigration,
  messageSupersededMigration,
  sessionScopedFilesMigration,
];

export async function migrate(db: SqlDatabase): Promise<number> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT`,
  );

  const result = await db.execute("SELECT version FROM _migrations ORDER BY version");
  const applied = new Set(result.rows.map((row) => Number(row.version)));
  let count = 0;

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    await applyMigration(db, migration);
    count += 1;
  }

  return count;
}

async function applyMigration(db: SqlDatabase, migration: Migration): Promise<void> {
  const commands: SqlCommand[] = migration.statements.map((sql) => [sql]);
  const params: SqlValue[] = [migration.version, migration.name, Date.now()];
  commands.push(["INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)", params]);
  await db.executeBatch(commands);
}

export { migrations };
