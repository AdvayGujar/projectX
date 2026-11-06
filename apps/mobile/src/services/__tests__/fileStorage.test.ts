import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createAppFileStorage } from "../fileStorage";

const mockDirectoryUris: string[] = [];
const mockDirectoryExists = jest.fn<() => boolean>();
const mockDirectoryDelete = jest.fn<() => void>();

const mockFileUris: string[] = [];
const mockFileSize = jest.fn<() => number>();
const mockFileCreate = jest.fn<(options?: unknown) => void>();
const mockFileWrite = jest.fn<(text: string) => Promise<void>>();
const mockParentDirectoryCreate = jest.fn<(options?: unknown) => void>();

jest.mock("expo-file-system", () => ({
  Paths: { document: { uri: "file:///sandbox/Documents" } },
  File: class {
    exists = false;

    constructor(uri: string) {
      mockFileUris.push(uri);
    }

    get size(): number {
      return mockFileSize();
    }

    get parentDirectory(): { create: (options?: unknown) => void } {
      return { create: mockParentDirectoryCreate };
    }

    create(options?: unknown): void {
      mockFileCreate(options);
    }

    write(text: string): Promise<void> {
      return mockFileWrite(text);
    }
  },
  Directory: class {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
      mockDirectoryUris.push(uri);
    }

    get exists(): boolean {
      return mockDirectoryExists();
    }

    delete(): void {
      mockDirectoryDelete();
    }
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDirectoryUris.length = 0;
  mockFileUris.length = 0;
  mockDirectoryExists.mockReturnValue(true);
  mockFileSize.mockReturnValue(0);
});

describe("app file storage directory removal", () => {
  it("deletes an existing directory under the Documents root", async () => {
    const storage = createAppFileStorage();

    await storage.removeDirectory("sessions/session-1");

    expect(mockDirectoryUris).toEqual(["file:///sandbox/Documents/sessions/session-1"]);
    expect(mockDirectoryDelete).toHaveBeenCalledTimes(1);
  });

  it("ignores a directory that does not exist", async () => {
    mockDirectoryExists.mockReturnValue(false);
    const storage = createAppFileStorage();

    await expect(storage.removeDirectory("sessions/missing")).resolves.toBeUndefined();

    expect(mockDirectoryDelete).not.toHaveBeenCalled();
  });

  it("rejects a path that escapes the sandbox without touching the filesystem", async () => {
    const storage = createAppFileStorage();

    await expect(storage.removeDirectory("../escape")).rejects.toMatchObject({
      code: "db_invalid",
    });

    expect(mockDirectoryUris).toHaveLength(0);
    expect(mockDirectoryDelete).not.toHaveBeenCalled();
  });
});

describe("app file storage text writes", () => {
  it("creates parent directories and writes text under the Documents root", async () => {
    mockFileSize.mockReturnValue(42);
    const storage = createAppFileStorage();

    const written = await storage.writeText(
      "projects/project-1/library/file-1.txt",
      "Link summary",
    );

    expect(mockFileUris).toEqual([
      "file:///sandbox/Documents/projects/project-1/library/file-1.txt",
    ]);
    expect(mockParentDirectoryCreate).toHaveBeenCalledWith({
      intermediates: true,
      idempotent: true,
    });
    expect(mockFileCreate).toHaveBeenCalledWith({ overwrite: true, intermediates: true });
    expect(mockFileWrite).toHaveBeenCalledWith("Link summary");
    expect(written).toEqual({ size: 42 });
  });

  it("rejects a path that escapes the sandbox without writing", async () => {
    const storage = createAppFileStorage();

    await expect(storage.writeText("../escape.txt", "text")).rejects.toMatchObject({
      code: "db_invalid",
    });

    expect(mockFileUris).toHaveLength(0);
    expect(mockFileWrite).not.toHaveBeenCalled();
  });
});
