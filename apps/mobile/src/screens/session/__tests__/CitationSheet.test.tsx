import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CitationSheet } from "@projectx/ui";

const citation = {
  fileId: "f1",
  fileName: "report.pdf",
  fileKind: "pdf" as const,
  page: 2,
  section: null,
};

describe("CitationSheet", () => {
  it("shows the page text and location", async () => {
    await render(
      <CitationSheet
        view={{ citation, text: "Revenue grew by 12%.", loading: false }}
        onClose={() => undefined}
        onOpenFile={() => undefined}
      />,
    );

    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("p.2")).toBeTruthy();
    expect(screen.getByText("Revenue grew by 12%.")).toBeTruthy();
  });

  it("opens the stored file", async () => {
    const onOpenFile = jest.fn();
    await render(
      <CitationSheet
        view={{ citation, text: "Revenue grew.", loading: false }}
        onClose={() => undefined}
        onOpenFile={onOpenFile}
      />,
    );

    fireEvent.press(screen.getByLabelText("Open report.pdf"));

    expect(onOpenFile).toHaveBeenCalledWith(citation);
  });

  it("shows the loading state", async () => {
    await render(
      <CitationSheet
        view={{ citation, text: null, loading: true }}
        onClose={() => undefined}
        onOpenFile={() => undefined}
      />,
    );

    expect(screen.getByText("Loading page…")).toBeTruthy();
  });
});
