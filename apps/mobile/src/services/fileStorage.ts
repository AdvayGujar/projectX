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

    async readBytes(relativePath, options) {
      throwIfAborted(options);
      const file = existingFile(relativePath);
      const bytes = await file.bytes();
      throwIfAborted(options);
      return bytes;
    },

    async readText(relativePath, options) {
      throwIfAborted(options);
      const file = existingFile(relativePath);
      const text = await file.text();
      throwIfAborted(options);
      return text;
    },

    async writeText(relativePath, text) {
      const file = new File(joinUnderRoot(DOCUMENTS_ROOT, relativePath));
      file.parentDirectory.create({ intermediates: true, idempotent: true });
      file.create({ overwrite: true, intermediates: true });
      await file.write(text);
      return { size: file.size };
    },

    uriFor(relativePath) {
      return joinUnderRoot(DOCUMENTS_ROOT, relativePath);
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

function existingFile(relativePath: string): File {
  const file = new File(joinUnderRoot(DOCUMENTS_ROOT, relativePath));
  if (!file.exists) {
    throw new AppError("file_not_found", `Stored file is missing: ${relativePath}`, {
      userMessage: "That file is missing from the app.",
    });
  }
  return file;
}

function throwIfAborted(options: FileStorageOptions | undefined): void {
  if (options?.signal?.aborted) {
    throw new AppError("cancelled", "File operation cancelled", {
      userMessage: "Import cancelled.",
    });
  }
}
