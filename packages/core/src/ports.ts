/**
 * Platform boundary for sandbox byte storage. Implemented by the mobile app with
 * expo-file-system; core only ever sees relative, validated paths.
 */
export interface CopiedFile {
  /** Byte size of the copied file, as reported by the filesystem. */
  readonly size: number;
}

export interface FileStoragePort {
  /** Copies an external picker URI to a safe path inside the app sandbox. */
  copyFromUri(sourceUri: string, relativePath: string): Promise<CopiedFile>;
  /** Removes a sandbox file. A missing file is not an error. */
  remove(relativePath: string): Promise<void>;
}
