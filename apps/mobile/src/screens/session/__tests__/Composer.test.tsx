import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Composer } from "@projectx/ui";

function props(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  return {
    value: "",
    placeholder: "Ask me. Task me.",
    think: true,
    search: false,
    streaming: false,
    attachments: [],
    onChangeText: () => undefined,
    onToggleThink: () => undefined,
    onToggleSearch: () => undefined,
    onAttach: () => undefined,
    onRemoveAttachment: () => undefined,
    onSend: () => undefined,
    onStop: () => undefined,
    onRecord: () => undefined,
    ...overrides,
  };
}

describe("Composer", () => {
  it("sends when Return is pressed", async () => {
    const onSend = jest.fn();
    await render(<Composer {...props({ value: "hello", onSend })} />);

    fireEvent(screen.getByLabelText("Message"), "submitEditing");

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("shows the record affordance when empty and send when there is text", async () => {
    const view = await render(<Composer {...props()} />);
    expect(screen.getByLabelText("Record")).toBeTruthy();

    await view.rerender(<Composer {...props({ value: "hello" })} />);
    expect(screen.getByLabelText("Send")).toBeTruthy();
  });

  it("offers stop instead of send while a turn is streaming", async () => {
    const onStop = jest.fn();
    await render(
      <Composer {...props({ value: "hello", streaming: true, onStop })} />,
    );

    expect(screen.queryByLabelText("Send")).toBeNull();
    fireEvent.press(screen.getByLabelText("Stop"));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("lists an attachment and removes it", async () => {
    const onRemoveAttachment = jest.fn();
    await render(
      <Composer
        {...props({
          attachments: [
            {
              id: "a1",
              name: "roadmap.docx",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              kind: "document",
              size: 1_024,
            },
          ],
          onRemoveAttachment,
        })}
      />,
    );

    expect(screen.getByText("roadmap.docx")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Remove roadmap.docx"));

    expect(onRemoveAttachment).toHaveBeenCalledWith("a1");
  });
});
