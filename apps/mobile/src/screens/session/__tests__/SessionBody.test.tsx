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
      onRegenerate={noop}
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

  it("calls back when regenerate is pressed", async () => {
    const onRegenerate = jest.fn();
    await render(
      <SessionBody
        turns={[{ id: "a1", role: "assistant", text: "done", status: "done" }]}
        error={null}
        streaming={false}
        onRegenerate={onRegenerate}
        onReadAloud={noop}
        onOpenSources={noop}
      />,
    );

    fireEvent.press(screen.getByLabelText("Regenerate"));

    expect(onRegenerate).toHaveBeenCalledWith("a1");
  });

  it("prints the error inline", async () => {
    await renderBody([{ id: "a1", role: "assistant", text: "done" }], "Network failed");

    expect(screen.getByText("Network failed")).toBeTruthy();
  });
});
