import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ComposerNotice } from "@projectx/ui";

describe("ComposerNotice", () => {
  it("stays hidden without a message", async () => {
    await render(<ComposerNotice message={null} onDismiss={() => undefined} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the capability message and dismisses it", async () => {
    const onDismiss = jest.fn();
    await render(<ComposerNotice message="This model cannot read images." onDismiss={onDismiss} />);

    expect(screen.getByText("This model cannot read images.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Dismiss notice"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
