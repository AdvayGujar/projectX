import { open, type SQLBatchTuple } from "@op-engineering/op-sqlite";

import type { SpikeResult } from "./types";

const ROWS = 50000;
const CHUNK = 5000;

export async function runSqlitePerf(): Promise<SpikeResult> {
  const started = Date.now();
  const db = open({ name: "spike.sqlite" });

  await db.execute("DROP TABLE IF EXISTS parts");
  await db.execute("DROP TABLE IF EXISTS parts_fts");
  await db.execute("CREATE TABLE parts (id INTEGER PRIMARY KEY, text TEXT NOT NULL)");
  await db.execute("CREATE VIRTUAL TABLE parts_fts USING fts5(text)");

  for (let chunk = 0; chunk < ROWS; chunk += CHUNK) {
    const commands: SQLBatchTuple[] = [];
    const end = Math.min(chunk + CHUNK, ROWS);
    for (let index = chunk + 1; index <= end; index += 1) {
      commands.push(["INSERT INTO parts (text) VALUES (?)", [`message number ${index}`]]);
    }
    await db.executeBatch(commands);
  }

  const insertedAt = Date.now();
  await db.execute("INSERT INTO parts_fts(rowid, text) SELECT id, text FROM parts");
  const indexedAt = Date.now();

  const result = await db.execute(
    "SELECT count(*) AS count FROM parts_fts WHERE parts_fts MATCH ?",
    ["message"],
  );
  const count = Number(result.rows?.[0]?.count ?? 0);
  const queriedAt = Date.now();

  db.close();

  return {
    label: "SQLite",
    detail: `${count} matches · insert ${insertedAt - started} ms · index ${indexedAt - insertedAt} ms · query ${queriedAt - indexedAt} ms`,
    ms: queriedAt - started,
  };
}
