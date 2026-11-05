import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ProjectEditorInitial } from "@projectx/ui";
import { ProjectEditorSheet } from "@projectx/ui";

const EMPTY: ProjectEditorInitial = { name: "", icon: null, instructions: "" };

function props(overrides: Partial<Parameters<typeof ProjectEditorSheet>[0]> = {}) {
  return {
    visible: true,
    mode: "create" as const,
    initial: EMPTY,
    busy: false,
    error: null,
    onSubmit: () => undefined,
    onClose: () => undefined,
    ...overrides,
  };
}

describe("ProjectEditorSheet", () => {
  it("creates a project with the chosen name and icon", async () => {
    const onSubmit = jest.fn();
    await render(<ProjectEditorSheet {...props({ onSubmit })} />);

    await fireEvent.changeText(screen.getByLabelText("Project name"), "Research");
    await fireEvent.press(screen.getByLabelText("Icon layers"));
    await fireEvent.press(screen.getByLabelText("Create project"));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Research",
      icon: "layers",
      instructions: "",
    });
  });

  it("starts an edit from the stored values", async () => {
    const onSubmit = jest.fn();
    await render(
      <ProjectEditorSheet
        {...props({
          mode: "edit",
          initial: { name: "Novel", icon: "layers", instructions: "Keep it short" },
          onSubmit,
        })}
      />,
    );

    expect(screen.getByDisplayValue("Novel")).toBeTruthy();
    expect(screen.getByDisplayValue("Keep it short")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Project name"), "Novel two");
    await fireEvent.press(screen.getByLabelText("Save project"));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Novel two",
      icon: "layers",
      instructions: "Keep it short",
    });
  });
});
