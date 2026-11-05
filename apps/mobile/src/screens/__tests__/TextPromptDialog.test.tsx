import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextPromptDialog } from "@projectx/ui";

function props(overrides: Partial<Parameters<typeof TextPromptDialog>[0]> = {}) {
  return {
    visible: true,
    title: "Rename chat",
    label: "Chat title",
    initialValue: "Old title",
    busy: false,
    error: null,
    onSubmit: () => undefined,
    onClose: () => undefined,
    ...overrides,
  };
}

describe("TextPromptDialog", () => {
  it("starts from the stored value and saves the trimmed text", async () => {
    const onSubmit = jest.fn();
    await render(<TextPromptDialog {...props({ onSubmit })} />);

    expect(screen.getByDisplayValue("Old title")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Chat title"), "  New title  ");
    await fireEvent.press(screen.getByLabelText("Save"));

    expect(onSubmit).toHaveBeenCalledWith("New title");
  });

  it("does not save an empty title and can be cancelled", async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    await render(<TextPromptDialog {...props({ onSubmit, onClose })} />);

    await fireEvent.changeText(screen.getByLabelText("Chat title"), "   ");
    await fireEvent.press(screen.getByLabelText("Save"));
    await fireEvent.press(screen.getByText("Cancel"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a readable error above the actions", async () => {
    await render(
      <TextPromptDialog {...props({ error: "Could not rename this chat." })} />,
    );

    expect(screen.getByText("Could not rename this chat.")).toBeTruthy();
  });
});
