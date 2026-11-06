import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { FileRecord } from "@projectx/core";
import * as Sharing from "expo-sharing";

import { openFileById, openStoredFile } from "../filePreview";

const mockExists = jest.fn<() => boolean>();
const mockCanPreview = jest.fn<() => Promise<boolean>>();
const mockPreview = jest.fn<() => Promise<void>>();
const mockUris: string[] = [];

const mockFileGet = jest.fn<(id: string) => Promise<FileRecord | null>>();

jest.mock("expo-file-system", () => ({
  Paths: { document: { uri: "file:///sandbox/Documents" } },
  File: class {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
      mockUris.push(uri);
    }

    get exists(): boolean {
      return mockExists();
    }

    canPreview(): Promise<boolean> {
      return mockCanPreview();
    }

    preview(): Promise<void> {
      return mockPreview();
    }
  },
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock("../../db/client", () => ({ getDbContext: async () => ({}) }));

jest.mock("@projectx/core", () => {
  const actual = jest.requireActual("@projectx/core") as typeof import("@projectx/core");
  return { ...actual, createFileRepository: () => ({ get: mockFileGet }) };
});

const mockShareAvailable = jest.mocked(Sharing.isAvailableAsync);
const mockShareAsync = jest.mocked(Sharing.shareAsync);

const FILE: FileRecord = {
  id: "file-1",
  sessionId: null,
  projectId: "project-1",
  name: "report.pdf",
  mime: "application/pdf",
  size: 2048,
  path: "projects/project-1/library/file-1.pdf",
  kind: "pdf",
  createdAt: 1,
};

const FILE_URI = "file:///sandbox/Documents/projects/project-1/library/file-1.pdf";

beforeEach(() => {
  jest.clearAllMocks();
  mockUris.length = 0;
  mockExists.mockReturnValue(true);
  mockCanPreview.mockResolvedValue(true);
  mockPreview.mockResolvedValue(undefined);
  mockShareAvailable.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
});

describe("openStoredFile", () => {
  it("opens the platform preview when the file can be previewed", async () => {
    const outcome = await openStoredFile(FILE.path, FILE.mime);

    expect(outcome).toBe("preview");
    expect(mockUris).toEqual([FILE_URI]);
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it("falls back to the share sheet when the platform cannot preview the file", async () => {
    mockCanPreview.mockResolvedValue(false);

    const outcome = await openStoredFile(FILE.path, FILE.mime);

    expect(outcome).toBe("shared");
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledWith(FILE_URI, {
      mimeType: FILE.mime,
      dialogTitle: "Open in…",
    });
  });

  it("rejects a missing file with a readable message", async () => {
    mockExists.mockReturnValue(false);

    await expect(openStoredFile(FILE.path, FILE.mime)).rejects.toMatchObject({
      code: "file_not_found",
      userMessage: "That file is no longer on this device.",
    });
    expect(mockCanPreview).not.toHaveBeenCalled();
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it("rejects when neither preview nor sharing is available", async () => {
    mockCanPreview.mockResolvedValue(false);
    mockShareAvailable.mockResolvedValue(false);

    await expect(openStoredFile(FILE.path, FILE.mime)).rejects.toMatchObject({
      code: "unknown",
      userMessage: "No app on this device can open that file.",
    });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it("treats a rejected preview check as not previewable", async () => {
    mockCanPreview.mockRejectedValue(new Error("unsupported"));

    const outcome = await openStoredFile(FILE.path, FILE.mime);

    expect(outcome).toBe("shared");
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });
});

describe("openFileById", () => {
  it("loads the file row and opens its stored path", async () => {
    mockFileGet.mockResolvedValue(FILE);

    await expect(openFileById("file-1")).resolves.toBe("preview");

    expect(mockFileGet).toHaveBeenCalledWith("file-1");
    expect(mockUris).toEqual([FILE_URI]);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("rejects when the file row is gone", async () => {
    mockFileGet.mockResolvedValue(null);

    await expect(openFileById("file-1")).rejects.toMatchObject({
      code: "file_not_found",
      userMessage: "That file is no longer part of this project.",
    });
    expect(mockUris).toHaveLength(0);
  });
});
