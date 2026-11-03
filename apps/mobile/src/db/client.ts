import type { DbContext } from "@projectx/core";
import { createDbContext, migrate } from "@projectx/core";

import { createOpSqliteDatabase } from "./opSqliteDatabase";

const DATABASE_NAME = "projectx.db";

let context: DbContext | null = null;
let opening: Promise<DbContext> | null = null;

/** One connection for the app process; migrations run before any repository is handed out. */
export async function getDbContext(): Promise<DbContext> {
  if (context) {
    return context;
  }
  if (!opening) {
    opening = open();
  }
  context = await opening;
  return context;
}

async function open(): Promise<DbContext> {
  const db = await createOpSqliteDatabase(DATABASE_NAME);
  await migrate(db);
  return createDbContext(db);
}
