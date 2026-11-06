import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { LoadedAttachment } from "../sessionQueries";
import { loadAttachment } from "../sessionQueries";
import { planAttachmentOpen } from "../attachmentOpen";

jest.mock("../sessionQueries", () => ({ loadAttachment: jest.fn() }));

const mockLoadAttachment = jest.mocked(loadAttachment);

const IMAGE: LoadedAttachment = {
  name: "photo.jpg",
  mimeType: "image/jpeg",
  kind: "image",
  base64: "ZmFrZQ==",
  fileId: null,
};

const DOCUMENT: LoadedAttachment = {
  name: "report.pdf",
  mimeType: "application/pdf",
  kind: "document",
  base64: null,
  fileId: "file-1",
};

beforeEach(() => {
  mockLoadAttachment.mockReset();
});

describe("planAttachmentOpen", () => {
  it("keeps images in the in-app viewer", async () => {
    mockLoadAttachment.mockResolvedValue(IMAGE);

    await expect(planAttachmentOpen("message-1", 0)).resolves.toEqual({
      kind: "viewer",
      attachment: IMAGE,
    });
  });

  it("reports an image whose bytes could not be read", async () => {
    mockLoadAttachment.mockResolvedValue({ ...IMAGE, base64: null });

    await expect(planAttachmentOpen("message-1", 0)).resolves.toEqual({
      kind: "notice",
      message: "Could not read the attached image.",
    });
  });

  it("sends a document to the OS by its stored file id", async () => {
    mockLoadAttachment.mockResolvedValue(DOCUMENT);

    await expect(planAttachmentOpen("message-1", 1)).resolves.toEqual({
      kind: "document",
      fileId: "file-1",
    });
  });

  it("reports a document with no stored file id", async () => {
    mockLoadAttachment.mockResolvedValue({ ...DOCUMENT, fileId: null });

    await expect(planAttachmentOpen("message-1", 1)).resolves.toEqual({
      kind: "notice",
      message: "That document is no longer available.",
    });
  });

  it("reports a part that no longer exists", async () => {
    mockLoadAttachment.mockResolvedValue(null);

    await expect(planAttachmentOpen("message-1", 2)).resolves.toEqual({
      kind: "notice",
      message: "That attachment is no longer available.",
    });
  });
});
