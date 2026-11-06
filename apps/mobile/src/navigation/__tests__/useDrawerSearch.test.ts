import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppError } from "@projectx/core";
import type { DrawerSearchItem } from "@projectx/ui";

import { useDrawerSearch } from "../useDrawerSearch";

const mockPush = jest.fn<(value: unknown) => void>();
const mockCloseDrawer = jest.fn<() => void>();
const mockSearchWorkspace =
  jest.fn<(query: string) => Promise<readonly unknown[]>>(async () => []);
const mockOpenFileById =
  jest.fn<(fileId: string) => Promise<"preview">>(async () => "preview");

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../services/searchService", () => ({
  searchWorkspace: (query: string) => mockSearchWorkspace(query),
}));
jest.mock("../../services/filePreview", () => ({
  openFileById: (fileId: string) => mockOpenFileById(fileId),
}));

const MESSAGE: DrawerSearchItem = {
  key: "message:part-1",
  kind: "message",
  snippet: "the [budget] plan",
  meta: "",
  sessionId: "session-1",
  messageId: "message-1",
};

const CHUNK: DrawerSearchItem = {
  key: "chunk:chunk-1",
  kind: "chunk",
  snippet: "[bridge] costs",
  meta: "p.2",
  fileId: "file-1",
};

function navigation() {
  return { closeDrawer: mockCloseDrawer };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenFileById.mockResolvedValue("preview");
});

describe("useDrawerSearch", () => {
  it("closes the drawer and focuses the message that was selected", async () => {
    const { result } = await renderHook(() => useDrawerSearch(navigation()));

    await act(async () => {
      result.current.selectResult(MESSAGE);
    });

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/session/[id]",
      params: { id: "session-1", focus: "message-1" },
    });
  });

  it("opens a chunk's file and closes the drawer on success", async () => {
    const { result } = await renderHook(() => useDrawerSearch(navigation()));
    const selectResult = result.current.selectResult;

    await act(async () => {
      selectResult(CHUNK);
    });

    expect(mockOpenFileById).toHaveBeenCalledWith("file-1");
    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("keeps the drawer open and shows the error when a chunk cannot open", async () => {
    mockOpenFileById.mockRejectedValue(
      new AppError("file_not_found", "missing", {
        userMessage: "That file is no longer on this device.",
      }),
    );
    const { result } = await renderHook(() => useDrawerSearch(navigation()));
    const selectResult = result.current.selectResult;

    await act(async () => {
      selectResult(CHUNK);
    });

    await waitFor(() => {
      expect(result.current.error).toBe("That file is no longer on this device.");
    });
    expect(mockCloseDrawer).not.toHaveBeenCalled();
  });
});
