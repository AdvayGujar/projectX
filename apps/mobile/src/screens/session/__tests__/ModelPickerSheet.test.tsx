import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ModelPickerSheet } from "@projectx/ui";
import type { ModelOption } from "@projectx/ui";

function model(overrides: Partial<ModelOption> = {}): ModelOption {
  return {
    id: "provider-1:deepseek-flash",
    label: "DeepSeek Flash",
    provider: "DeepSeek",
    effort: "high",
    reasoning: true,
    canDisableReasoning: true,
    reasoningEfforts: ["low", "high", "max"],
    vision: false,
    tools: true,
    ...overrides,
  };
}

describe("ModelPickerSheet reasoning step", () => {
  it("offers only the effort levels the model accepts", async () => {
    const onSelect = jest.fn();
    await render(
      <ModelPickerSheet
        visible
        models={[model()]}
        selectedId={null}
        onSelect={onSelect}
        onClose={() => undefined}
      />,
    );

    await fireEvent.press(screen.getByText("DeepSeek Flash"));

    expect(screen.getByText("Reasoning effort")).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
    expect(screen.queryByText("Extra high")).toBeNull();

    await fireEvent.press(screen.getByText("Max"));

    expect(onSelect).toHaveBeenCalledWith(model(), "max");
  });

  it("selects an always-on model without asking for an effort", async () => {
    const alwaysOn = model({
      id: "provider-1:gemini-4-argon",
      label: "Gemini 4 Argon",
      provider: "Google",
      effort: "on",
      canDisableReasoning: false,
      reasoningEfforts: [],
    });
    const onSelect = jest.fn();
    await render(
      <ModelPickerSheet
        visible
        models={[alwaysOn]}
        selectedId={null}
        onSelect={onSelect}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("Reasoning · always on")).toBeTruthy();
    await fireEvent.press(screen.getByText("Gemini 4 Argon"));

    expect(onSelect).toHaveBeenCalledWith(alwaysOn, "on");
  });
});
