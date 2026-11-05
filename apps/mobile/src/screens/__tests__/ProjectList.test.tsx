import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ProjectList } from "@projectx/ui";

const PROJECTS = [
  { id: "p1", name: "Novel", icon: "layers", sessionCount: 2 },
  { id: "p2", name: "Research", icon: null, sessionCount: 0 },
];

describe("ProjectList", () => {
  it("shows each project with its chat count", async () => {
    await render(
      <ProjectList projects={PROJECTS} onSelect={() => undefined} onAdd={() => undefined} />,
    );

    expect(screen.getByText("Novel")).toBeTruthy();
    expect(screen.getByText("2 chats")).toBeTruthy();
    expect(screen.getByText("Research")).toBeTruthy();
    expect(screen.getByText("0 chats")).toBeTruthy();
  });

  it("selects a project and starts a new one", async () => {
    const onSelect = jest.fn();
    const onAdd = jest.fn();
    await render(<ProjectList projects={PROJECTS} onSelect={onSelect} onAdd={onAdd} />);

    await fireEvent.press(screen.getByLabelText("Novel, 2 chats"));
    await fireEvent.press(screen.getByLabelText("New project"));

    expect(onSelect).toHaveBeenCalledWith("p1");
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("explains the empty list", async () => {
    await render(<ProjectList projects={[]} onSelect={() => undefined} onAdd={() => undefined} />);

    expect(screen.getByText(/No projects yet/)).toBeTruthy();
  });
});
