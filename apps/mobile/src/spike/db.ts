import {
  createDbContext,
  createMessageRepository,
  createProjectRepository,
  createSearchRepository,
  createSessionRepository,
  migrate,
} from "@projectx/core";

import { createOpSqliteDatabase } from "../db/opSqliteDatabase";
import type { SpikeResult } from "./types";

export async function runDbCheck(): Promise<SpikeResult> {
  const started = Date.now();
  const database = await createOpSqliteDatabase(`projectx-${started}.sqlite`);

  try {
    const applied = await migrate(database);
    const context = createDbContext(database);
    const projects = createProjectRepository(context);
    const sessions = createSessionRepository(context);
    const messages = createMessageRepository(context);
    const search = createSearchRepository(context);

    const project = await projects.create({ name: "Spike project" });
    const session = await sessions.create({ projectId: project.id, title: "Spike chat" });
    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{
        type: "text",
        data: { text: "The quick brown fox" },
        searchText: "The quick brown fox",
      }],
    });

    const listed = await messages.list(session.id);
    const hits = await search.messages("brown fox", { projectId: project.id });
    return {
      label: "DB",
      detail: `${applied} migration, ${listed.length} message, ${hits.length} hit`,
      ms: Date.now() - started,
    };
  } finally {
    await database.close();
  }
}
