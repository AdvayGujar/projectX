import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createAppFileStorage } from "../fileStorage";

const mockDirectoryUris: string[] = [];
const mockDirectoryExists = jest.fn<() => boolean>();
const mockDirectoryDelete = jest.fn<() => void>();

jest.mock("expo-file-system", () => ({
  Paths: { document: { uri: "file:///sandbox/Documents" } },
  File: class {
    exists = false;
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
  mockDirectoryExists.mockReturnValue(true);
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
