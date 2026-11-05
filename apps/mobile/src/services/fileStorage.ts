import type { FileStorageOptions, FileStoragePort } from "@projectx/core";
import { AppError, joinUnderRoot } from "@projectx/core";
import { Directory, File, Paths } from "expo-file-system";

const DOCUMENTS_ROOT = Paths.document.uri;

/**
 * Sandbox adapter for the core FileStoragePort. Every path is validated by core before it is
 * joined to the Documents root, so picker or database values cannot escape the app sandbox.
 */
export function createAppFileStorage(): FileStoragePort {
  return {
    async copyFromUri(sourceUri, relativePath, options) {
      throwIfAborted(options);
      const destination = new File(joinUnderRoot(DOCUMENTS_ROOT, relativePath));
      destination.parentDirectory.create({ intermediates: true, idempotent: true });
      const source = new File(sourceUri);
      await source.copy(destination, { overwrite: true });
      throwIfAborted(options);
      return { size: destination.exists ? destination.size : null };
    },

    async remove(relativePath) {
      const file = new File(joinUnderRoot(DOCUMENTS_ROOT, relativePath));
      if (file.exists) {
        file.delete();
      }
    },

    async removeDirectory(relativePath) {
      const directory = new Directory(joinUnderRoot(DOCUMENTS_ROOT, relativePath));
      if (directory.exists) {
        directory.delete();
      }
    },
  };
}

function throwIfAborted(options: FileStorageOptions | undefined): void {
  if (options?.signal?.aborted) {
    throw new AppError("cancelled", "File operation cancelled", {
      userMessage: "Import cancelled.",
    });
  }
}
