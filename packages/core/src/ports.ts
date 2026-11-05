/**
 * Platform boundary for sandbox byte storage. Implemented by the mobile app with
 * expo-file-system; core only ever sees relative, validated paths.
 */
export interface FileStorageOptions {
  readonly signal?: AbortSignal;
}

export interface CopiedFile {
  /** Byte size of the copied file, or null when the filesystem cannot report it. */
  readonly size: number | null;
}

export interface FileStoragePort {
  /** Copies an external picker URI to a safe path inside the app sandbox. */
  copyFromUri(
    sourceUri: string,
    relativePath: string,
    options?: FileStorageOptions,
  ): Promise<CopiedFile>;
  /**
   * Removes a sandbox file. A missing file is not an error. Cleanup deliberately takes no
   * signal: rollback must run even when the import was aborted.
   */
  remove(relativePath: string): Promise<void>;
}
