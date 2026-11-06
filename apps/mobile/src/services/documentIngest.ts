import type { ImportedFile, ImportFileInput } from "@projectx/core";
import { createFileImporter, createPdfExtractionService } from "@projectx/core";

import { getDbContext } from "../db/client";
import { createAppFileStorage } from "./fileStorage";
import { createExpoPdfPort } from "./pdfExtractor";

/**
 * Imports a file and runs the PDF pipeline when needed. Non-PDF documents stay pending for
 * their format pipeline; images are marked ready by the importer. Extraction failures are
 * recorded on the document row and never block the library entry.
 */
export async function ingestFile(input: ImportFileInput): Promise<ImportedFile> {
  const context = await getDbContext();
  const storage = createAppFileStorage();
  const imported = await createFileImporter(context, storage).import(input);
  if (imported.file.kind === "pdf" && imported.document.status === "pending") {
    await createPdfExtractionService(context, createExpoPdfPort()).extract({
      documentId: imported.document.id,
      fileUri: storage.uriFor(imported.file.path),
    });
  }
  return imported;
}
