import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AttachmentViewer } from "@projectx/ui";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("AttachmentViewer", () => {
  it("renders nothing without an attachment", async () => {
    await render(<AttachmentViewer attachment={null} onClose={() => undefined} />);

    expect(screen.queryByText("photo.png")).toBeNull();
  });

  it("shows the image and closes", async () => {
    const onClose = jest.fn();
    await render(
      <AttachmentViewer
        attachment={{ name: "photo.png", mimeType: "image/png", kind: "image", base64: PNG }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("photo.png")).toBeTruthy();
    expect(screen.getByLabelText("Preview of photo.png")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
