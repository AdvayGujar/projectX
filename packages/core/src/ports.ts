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

export interface WrittenText {
  /** Byte size the adapter wrote, used for the accompanying file row. */
  readonly size: number;
}

export interface FileStoragePort {
  /** Copies an external picker URI to a safe path inside the app sandbox. */
  copyFromUri(
    sourceUri: string,
    relativePath: string,
    options?: FileStorageOptions,
  ): Promise<CopiedFile>;
  /**
   * Writes UTF-8 text to a sandbox path, creating parent directories. Used for generated
   * snapshots such as a project link summary.
   */
  writeText(relativePath: string, text: string): Promise<WrittenText>;
  /**
   * Removes a sandbox file. A missing file is not an error. Cleanup deliberately takes no
   * signal: rollback must run even when the import was aborted.
   */
  remove(relativePath: string): Promise<void>;
  /**
   * Removes a sandbox directory and everything inside it. A missing directory is not an
   * error. Deleting a chat uses this to clear its session folder after the rows are gone.
   */
  removeDirectory(relativePath: string): Promise<void>;
}

/**
 * Platform boundary for reading PDF text. Page numbers are 1-based. Passwords are not
 * supported in this milestone; encrypted PDFs surface as extraction errors.
 */
export interface PdfRequestOptions {
  readonly signal?: AbortSignal;
}

export interface PdfPort {
  getPageCount(fileUri: string, options?: PdfRequestOptions): Promise<number>;
  extractPage(fileUri: string, page: number, options?: PdfRequestOptions): Promise<string>;
}

/**
 * Platform boundary for fetching a user-supplied link. Core only accepts HTTP(S); the
 * adapter enforces the timeout, the size cap, and the user agent.
 */
export interface WebFetchInput {
  readonly url: string;
  readonly signal?: AbortSignal;
}

export interface WebFetchResult {
  readonly status: number;
  /** Base content type without parameters, or null when the server omitted it. */
  readonly contentType: string | null;
  /** Empty for non-text responses, which the importer stores as metadata only. */
  readonly body: string;
  readonly finalUrl: string;
}

export interface WebFetchPort {
  fetch(input: WebFetchInput): Promise<WebFetchResult>;
}
