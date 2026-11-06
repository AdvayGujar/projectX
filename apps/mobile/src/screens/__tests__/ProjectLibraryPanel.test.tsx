import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { FileRecord, ProjectLink } from "@projectx/core";

import type { ProjectLibraryItem } from "../../services/projectLibraryService";
import { ProjectLibraryPanel } from "../project/ProjectLibraryPanel";

jest.mock("@shopify/flash-list", () => {
  const React = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  return {
    FlashList: (props: {
      readonly data: readonly unknown[];
      readonly keyExtractor: (item: unknown) => string;
      readonly renderItem: (info: {
        readonly item: unknown;
        readonly index: number;
      }) => import("react").ReactElement;
    }) =>
      React.createElement(
        View,
        null,
        props.data.map((item, index) =>
          React.createElement(
            View,
            { key: props.keyExtractor(item) },
            props.renderItem({ item, index }),
          ),
        ),
      ),
  };
});

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

const FAILED_LINK: ProjectLink = {
  id: "link-1",
  projectId: "project-1",
  url: "https://example.com/reports/bridge",
  title: "Bridge report",
  mediaType: "text/html",
  snapshotFileId: null,
  status: "error",
  error: "That site returned HTTP 404.",
  fetchedAt: null,
  createdAt: 2,
};

const ITEMS: readonly ProjectLibraryItem[] = [
  { kind: "link", link: FAILED_LINK },
  { kind: "file", file: FILE },
];

function props(overrides: Partial<Parameters<typeof ProjectLibraryPanel>[0]> = {}) {
  return {
    items: ITEMS,
    busy: false,
    onAddFile: () => undefined,
    onAddLink: () => undefined,
    onOpenFile: () => undefined,
    onOpenLink: () => undefined,
    onRemoveFile: () => undefined,
    onRemoveLink: () => undefined,
    ...overrides,
  };
}

describe("ProjectLibraryPanel", () => {
  it("shows a file row with its kind and size", async () => {
    await render(<ProjectLibraryPanel {...props()} />);

    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("PDF · 2 KB")).toBeTruthy();
    expect(screen.getByLabelText("Add file")).toBeTruthy();
    expect(screen.getByLabelText("Add link")).toBeTruthy();
  });

  it("shows a link row with its host and fetch error", async () => {
    await render(<ProjectLibraryPanel {...props()} />);

    expect(screen.getByText("Bridge report")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
    expect(screen.getByText("That site returned HTTP 404.")).toBeTruthy();
  });

  it("opens a file row and a link row", async () => {
    const onOpenFile = jest.fn();
    const onOpenLink = jest.fn();
    await render(<ProjectLibraryPanel {...props({ onOpenFile, onOpenLink })} />);

    await fireEvent.press(screen.getByLabelText("Open report.pdf"));
    await fireEvent.press(screen.getByLabelText("Open Bridge report"));

    expect(onOpenFile).toHaveBeenCalledWith(FILE);
    expect(onOpenLink).toHaveBeenCalledWith(FAILED_LINK);
  });

  it("calls the add and remove actions", async () => {
    const onAddFile = jest.fn();
    const onAddLink = jest.fn();
    const onOpenFile = jest.fn();
    const onOpenLink = jest.fn();
    const onRemoveFile = jest.fn();
    const onRemoveLink = jest.fn();
    await render(
      <ProjectLibraryPanel
        {...props({
          onAddFile,
          onAddLink,
          onOpenFile,
          onOpenLink,
          onRemoveFile,
          onRemoveLink,
        })}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Add file"));
    await fireEvent.press(screen.getByLabelText("Add link"));
    await fireEvent.press(screen.getByLabelText("Remove report.pdf"));
    await fireEvent.press(screen.getByLabelText("Remove Bridge report"));

    expect(onAddFile).toHaveBeenCalledTimes(1);
    expect(onAddLink).toHaveBeenCalledTimes(1);
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(onOpenLink).not.toHaveBeenCalled();
    expect(onRemoveFile).toHaveBeenCalledWith(FILE);
    expect(onRemoveLink).toHaveBeenCalledWith(FAILED_LINK);
  });

  it("explains an empty library", async () => {
    await render(<ProjectLibraryPanel {...props({ items: [] })} />);

    expect(screen.getByText(/No files or links yet/)).toBeTruthy();
  });
});
