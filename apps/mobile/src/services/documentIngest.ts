import type { FileKind, ImportedFile, ImportFileInput } from "@projectx/core";
import {
  createDocumentRepository,
  createFileImporter,
  createPdfExtractionService,
  createStructuredExtractionService,
} from "@projectx/core";

import { getDbContext } from "../db/client";
import { createAppFileStorage } from "./fileStorage";
import { createExpoPdfPort } from "./pdfExtractor";

const STRUCTURED_KINDS: readonly FileKind[] = ["docx", "xlsx", "pptx", "text"];

/**
 * Imports a file and runs the matching extraction pipeline. PDFs use the native port;
 * DOCX, XLSX, PPTX, and text are parsed in core from the stored bytes. Unknown files stay
 * on the document row as an error so the model never promises text that does not exist.
 */
export async function ingestFile(input: ImportFileInput): Promise<ImportedFile> {
  const context = await getDbContext();
  const storage = createAppFileStorage();
  const imported = await createFileImporter(context, storage).import(input);
  if (imported.document.status !== "pending") {
    return imported;
  }

  if (imported.file.kind === "pdf") {
    await createPdfExtractionService(context, createExpoPdfPort()).extract({
      documentId: imported.document.id,
      fileUri: storage.uriFor(imported.file.path),
    });
  } else if (STRUCTURED_KINDS.includes(imported.file.kind)) {
    await createStructuredExtractionService(context, storage).extract({
      documentId: imported.document.id,
    });
  } else {
    await createDocumentRepository(context).update(imported.document.id, {
      status: "error",
      error: "This file type cannot be read.",
    });
  }

  const document = await createDocumentRepository(context).get(imported.document.id);
  return document ? { ...imported, document } : imported;
}
