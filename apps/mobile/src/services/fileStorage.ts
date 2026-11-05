import type { FileStoragePort } from "@projectx/core";
import { assertSafeRelativePath, joinUnderRoot } from "@projectx/core";
import { File, Paths } from "expo-file-system";

const DOCUMENTS_ROOT = Paths.document.uri;

/**
 * Sandbox adapter for the core FileStoragePort. Every path is validated by core before it is
 * joined to the Documents root, so picker or database values cannot escape the app sandbox.
 */
export function createAppFileStorage(): FileStoragePort {
  return {
    async copyFromUri(sourceUri, relativePath) {
      assertSafeRelativePath(relativePath);
      const destination = new File(joinUnderRoot(DOCUMENTS_ROOT, relativePath));
      destination.parentDirectory.create({ intermediates: true, idempotent: true });
      const source = new File(sourceUri);
      await source.copy(destination, { overwrite: true });
      return { size: destination.size };
    },

    async remove(relativePath) {
      assertSafeRelativePath(relativePath);
      const file = new File(joinUnderRoot(DOCUMENTS_ROOT, relativePath));
      if (file.exists) {
        file.delete();
      }
    },
  };
}
