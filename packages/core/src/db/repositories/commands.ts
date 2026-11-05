import type { SqlCommand } from "../types";

/** Shared by the standalone document repository and the transactional import path. */
export function insertPendingDocumentCommand(id: string, fileId: string): SqlCommand {
  return [
    "INSERT INTO documents (id, file_id, status) VALUES (?, ?, 'pending')",
    [id, fileId],
  ];
}
