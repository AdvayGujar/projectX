import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { DrawerSearchGroup, DrawerSearchResultsProps } from "@projectx/ui";
import { DrawerSearchResults } from "@projectx/ui";

const GROUPS: readonly DrawerSearchGroup[] = [
  {
    key: "session:session-1",
    title: "Quarterly plan",
    subtitle: "Alpha",
    items: [
      {
        key: "message:part-1",
        kind: "message",
        snippet: "the [budget] plan",
        meta: "",
        sessionId: "session-1",
        messageId: "message-1",
      },
    ],
  },
  {
    key: "file:file-1",
    title: "Bridge report",
    subtitle: "File",
    items: [
      {
        key: "chunk:chunk-1",
        kind: "chunk",
        snippet: "[bridge] costs",
        meta: "p.3",
        fileId: "file-1",
      },
    ],
  },
];

function props(
  overrides: Partial<DrawerSearchResultsProps> = {},
): DrawerSearchResultsProps {
  return {
    groups: GROUPS,
    searching: false,
    error: null,
    onSelect: () => undefined,
    ...overrides,
  };
}

describe("DrawerSearchResults", () => {
  it("renders a group header and its snippet rows", async () => {
    await render(<DrawerSearchResults {...props()} />);

    expect(screen.getByText("Quarterly plan")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bridge report")).toBeTruthy();
    expect(screen.getByText("p.3")).toBeTruthy();
  });

  it("emphasises the bracketed FTS term", async () => {
    await render(<DrawerSearchResults {...props()} />);

    expect(screen.getByText("budget")).toHaveStyle({ fontWeight: "600" });
    expect(screen.queryByText("the [budget] plan")).toBeNull();
  });

  it("selects a message and a chunk row", async () => {
    const onSelect = jest.fn();
    await render(<DrawerSearchResults {...props({ onSelect })} />);

    await fireEvent.press(screen.getByLabelText("Quarterly plan: the budget plan"));
    await fireEvent.press(screen.getByLabelText("Bridge report: bridge costs"));

    expect(onSelect).toHaveBeenCalledWith(GROUPS[0]?.items[0]);
    expect(onSelect).toHaveBeenCalledWith(GROUPS[1]?.items[0]);
  });

  it("shows the empty state when there are no matches", async () => {
    await render(<DrawerSearchResults {...props({ groups: [] })} />);

    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("shows the searching state instead of the empty state", async () => {
    await render(<DrawerSearchResults {...props({ groups: [], searching: true })} />);

    expect(screen.getByText("Searching…")).toBeTruthy();
    expect(screen.queryByText("No matches")).toBeNull();
  });

  it("shows an inline error", async () => {
    await render(
      <DrawerSearchResults
        {...props({ groups: [], error: "Could not search this workspace." })}
      />,
    );

    expect(screen.getByText("Could not search this workspace.")).toBeTruthy();
    expect(screen.queryByText("No matches")).toBeNull();
  });
});
