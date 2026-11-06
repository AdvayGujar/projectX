import { describe, expect, it } from "@jest/globals";
import type { AttachmentChip } from "@projectx/ui";

import { attachmentProblem, MAX_IMAGE_BYTES } from "../attachments";

const chat = { label: "DeepSeek Chat", vision: false, tools: true };
const vision = { label: "Gemini 4 Argon", vision: true, tools: true };
const noTools = { label: "Basic Model", vision: true, tools: false };

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

  it("blocks documents outside a project", () => {
    expect(attachmentProblem([document()], vision)).toBe(
      "Documents belong to a project. Move this chat into a project or remove the file.",
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

  it("allows documents when the model can read them", () => {
    expect(attachmentProblem([document()], vision, { documentsAllowed: true })).toBeNull();
  });

  it("blocks documents for a model without tool support", () => {
    expect(attachmentProblem([document()], noTools, { documentsAllowed: true })).toBe(
      "Basic Model cannot read documents. Choose a model with tool support or remove the file.",
    );
    expect(attachmentProblem([document()], null, { documentsAllowed: true })).toBe(
      "The selected model cannot read documents. Choose a model with tool support or remove the file.",
    );
  });

  it("still enforces image rules when documents are allowed", () => {
    expect(
      attachmentProblem([document(), image()], chat, { documentsAllowed: true }),
    ).toBe(
      "DeepSeek Chat cannot read images. Choose a vision model or remove the image.",
    );
    expect(
      attachmentProblem([document(), image({ size: MAX_IMAGE_BYTES + 1 })], vision, {
        documentsAllowed: true,
      }),
    ).toBe("photo.jpg is larger than 10 MB.");
  });
});
