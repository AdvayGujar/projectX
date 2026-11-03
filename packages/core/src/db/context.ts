import type { Clock, DbContext, IdFactory, SqlDatabase } from "./types";

export interface DbContextOptions {
  ids?: IdFactory;
  now?: Clock;
}

export function createDbContext(db: SqlDatabase, options: DbContextOptions = {}): DbContext {
  return {
    db,
    ids: options.ids ?? defaultId,
    now: options.now ?? Date.now,
  };
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
