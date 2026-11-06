import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ViewTurn } from "@projectx/ui";

import { SessionBody } from "../SessionBody";

const noop = () => undefined;

function renderBody(turns: readonly ViewTurn[], error: string | null = null, streaming = false) {
  return render(
    <SessionBody
      turns={turns}
      error={error}
      streaming={streaming}
      onCopy={noop}
      onRegenerate={noop}
      onOpenAttachment={noop}
      onOpenCitation={noop}
      onReadAloud={noop}
      onOpenSources={noop}
    />,
  );
}

describe("SessionBody", () => {
  it("shows a placeholder before the first turn", async () => {
    await renderBody([]);
    expect(screen.getByText("Send a message to start.")).toBeTruthy();
  });

  it("keeps turn actions hidden while streaming", async () => {
    await renderBody(
      [
        { id: "u1", role: "user", text: "hello" },
        { id: "a1", role: "assistant", text: "partial", status: "streaming" },
      ],
      null,
      true,
    );

    expect(screen.getByText("partial")).toBeTruthy();
    expect(screen.queryByLabelText("Copy")).toBeNull();
    expect(screen.queryByText(/in \/ .* out/)).toBeNull();
  });

  it("shows actions and cost once the turn is done", async () => {
    await renderBody([
      {
        id: "a1",
        role: "assistant",
        text: "done",
        status: "done",
        cost: { model: "Beam Free", tokens: "10 in / 5 out" },
      },
    ]);

    expect(screen.getByLabelText("Copy")).toBeTruthy();
    expect(screen.getByText("Beam Free · 10 in / 5 out")).toBeTruthy();
  });

  it("shows the attachments linked to a user message", async () => {
    await renderBody([
      {
        id: "u1",
        role: "user",
        text: "What is in this chart?",
        attachments: [
          { index: 0, name: "revenue-chart.png", mimeType: "image/png", kind: "image" },
        ],
      },
    ]);

    expect(screen.getByText("revenue-chart.png")).toBeTruthy();
    expect(screen.getByLabelText("Open revenue-chart.png")).toBeTruthy();
  });

  it("opens an attachment from the user turn", async () => {
    const onOpenAttachment = jest.fn();
    await render(
      <SessionBody
        turns={[
          {
            id: "u1",
            role: "user",
            text: "Check this",
            attachments: [
              { index: 0, name: "photo.png", mimeType: "image/png", kind: "image" },
            ],
          },
        ]}
        error={null}
        streaming={false}
        onCopy={noop}
        onRegenerate={noop}
        onOpenAttachment={onOpenAttachment}
        onOpenCitation={noop}
        onReadAloud={noop}
        onOpenSources={noop}
      />,
    );

    fireEvent.press(screen.getByLabelText("Open photo.png"));

    expect(onOpenAttachment).toHaveBeenCalledWith("u1", {
      index: 0,
      name: "photo.png",
      mimeType: "image/png",
      kind: "image",
    });
  });

  it("calls back when copy is pressed", async () => {
    const onCopy = jest.fn();
    await render(
      <SessionBody
        turns={[{ id: "a1", role: "assistant", text: "done", status: "done" }]}
        error={null}
        streaming={false}
        onCopy={onCopy}
        onRegenerate={noop}
        onOpenAttachment={noop}
        onOpenCitation={noop}
        onReadAloud={noop}
        onOpenSources={noop}
      />,
    );

    fireEvent.press(screen.getByLabelText("Copy"));

    expect(onCopy).toHaveBeenCalledWith("a1");
  });

  it("drops the thinking label once reasoning has streamed", async () => {
    await renderBody(
      [
        {
          id: "a1",
          role: "assistant",
          text: "",
          status: "streaming",
          reasoningRequested: true,
          reasoning: "Checked the chart.",
        },
      ],
      null,
      true,
    );

    expect(screen.getByText("Thought")).toBeTruthy();
    expect(screen.queryByText("Thinking…")).toBeNull();
  });

  it("shows tool activity without reasoning", async () => {
    await renderBody([
      {
        id: "a1",
        role: "assistant",
        text: "The report grew.",
        status: "done",
        reasoningRequested: false,
        activity: [
          { kind: "read", tool: "read_document", detail: "report.pdf · 2 pages" },
        ],
      },
    ]);

    expect(screen.getByText("Thought · 1 tool · 1 document read")).toBeTruthy();
  });

  it("calls back when regenerate is pressed", async () => {
    const onRegenerate = jest.fn();
    await render(
      <SessionBody
        turns={[{ id: "a1", role: "assistant", text: "done", status: "done" }]}
        error={null}
        streaming={false}
        onCopy={noop}
        onRegenerate={onRegenerate}
        onOpenAttachment={noop}
        onOpenCitation={noop}
        onReadAloud={noop}
        onOpenSources={noop}
      />,
    );

    fireEvent.press(screen.getByLabelText("Regenerate"));

    expect(onRegenerate).toHaveBeenCalledWith("a1");
  });

  it("opens a citation chip from the answer", async () => {
    const onOpenCitation = jest.fn();
    const citation = {
      fileId: "f1",
      fileName: "report.pdf",
      fileKind: "pdf" as const,
      page: 2,
      section: null,
    };
    await render(
      <SessionBody
        turns={[
          {
            id: "a1",
            role: "assistant",
            text: "Revenue grew (p.2).",
            status: "done",
            citations: [citation],
          },
        ]}
        error={null}
        streaming={false}
        onCopy={noop}
        onRegenerate={noop}
        onOpenAttachment={noop}
        onOpenCitation={onOpenCitation}
        onReadAloud={noop}
        onOpenSources={noop}
      />,
    );

    fireEvent.press(screen.getByLabelText("Open source p.2"));

    expect(onOpenCitation).toHaveBeenCalledWith(citation);
  });

  it("opens a citation inside bold text", async () => {
    const onOpenCitation = jest.fn();
    const citation = {
      fileId: "f1",
      fileName: "report.pdf",
      fileKind: "pdf" as const,
      page: 2,
      section: null,
    };
    await render(
      <SessionBody
        turns={[
          {
            id: "a1",
            role: "assistant",
            text: "Revenue grew (**p.2**).",
            status: "done",
            citations: [citation],
          },
        ]}
        error={null}
        streaming={false}
        onCopy={noop}
        onRegenerate={noop}
        onOpenAttachment={noop}
        onOpenCitation={onOpenCitation}
        onReadAloud={noop}
        onOpenSources={noop}
      />,
    );

    fireEvent.press(screen.getByLabelText("Open source p.2"));

    expect(onOpenCitation).toHaveBeenCalledWith(citation);
  });

  it("prints the error inline", async () => {
    await renderBody([{ id: "a1", role: "assistant", text: "done" }], "Network failed");

    expect(screen.getByText("Network failed")).toBeTruthy();
  });
});
