import { describe, expect, it } from "@jest/globals";
import type { AttachmentChip } from "@projectx/ui";

import { attachmentProblem, MAX_IMAGE_BYTES } from "../attachments";

const chat = { label: "DeepSeek Chat", vision: false };
const vision = { label: "Gemini 4 Argon", vision: true };

function image(overrides: Partial<AttachmentChip> = {}): AttachmentChip {
  return {
    id: "file:///photo.jpg",
    name: "photo.jpg",
    mimeType: "image/jpeg",
    kind: "image",
    size: 2_048,
    ...overrides,
  };
}

function document(): AttachmentChip {
  return {
    id: "file:///brief.pdf",
    name: "brief.pdf",
    mimeType: "application/pdf",
    kind: "document",
    size: 4_096,
  };
}

describe("attachment capability check", () => {
  it("allows an empty composer", () => {
    expect(attachmentProblem([], chat)).toBeNull();
  });

  it("blocks documents until extraction exists", () => {
    expect(attachmentProblem([document()], vision)).toBe(
      "Documents can't be read yet. Remove the file or attach an image.",
    );
  });

  it("names the model when it cannot read images", () => {
    expect(attachmentProblem([image()], chat)).toBe(
      "DeepSeek Chat cannot read images. Choose a vision model or remove the image.",
    );
  });

  it("allows an image on a vision model", () => {
    expect(attachmentProblem([image()], vision)).toBeNull();
  });

  it("rejects images over the inline size limit", () => {
    expect(attachmentProblem([image({ size: MAX_IMAGE_BYTES + 1 })], vision)).toBe(
      "photo.jpg is larger than 10 MB.",
    );
  });
});
