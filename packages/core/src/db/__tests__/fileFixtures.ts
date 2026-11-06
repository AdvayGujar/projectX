import type { AddFileInput, FileRecord } from "../index";
import { createFileRepository } from "../index";

export type FileContext = Parameters<typeof createFileRepository>[0];
export type FileOverrides = Partial<AddFileInput>;

/** Adds a session-owned file at the path the importer would use for a standalone chat. */
export async function addSessionFile(
  ctx: FileContext,
  sessionId: string,
  overrides: FileOverrides = {},
): Promise<FileRecord> {
  const files = createFileRepository(ctx);
  const id = ctx.ids();
  return files.add({
    id,
    sessionId,
    name: "report.pdf",
    mime: "application/pdf",
    size: 1024,
    path: `sessions/${sessionId}/files/${id}.pdf`,
    kind: "pdf",
    ...overrides,
  });
}

/** Adds a project-owned file at the path the importer would use for a project chat. */
export async function addProjectFile(
  ctx: FileContext,
  projectId: string,
  overrides: FileOverrides = {},
): Promise<FileRecord> {
  const files = createFileRepository(ctx);
  const id = ctx.ids();
  return files.add({
    id,
    projectId,
    name: "report.pdf",
    mime: "application/pdf",
    size: 1024,
    path: `projects/${projectId}/library/${id}.pdf`,
    kind: "pdf",
    ...overrides,
  });
}
