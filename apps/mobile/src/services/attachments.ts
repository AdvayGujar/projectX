import type { AttachmentChip, ModelOption } from "@projectx/ui";
import { File } from "expo-file-system";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ImageAttachment {
  readonly name: string;
  readonly mimeType: string;
  readonly base64: string;
}

export interface AttachmentRules {
  /** A session screen enables this once it exists; the new-chat screen has no chat to own a file. */
  readonly documentsAllowed?: boolean;
}

/**
 * The single capability gate for attachments (D12). Documents are blocked unless the caller
 * has a project library to read them through; images always need a vision model and fit the
 * inline size limit.
 */
export function attachmentProblem(
  attachments: readonly AttachmentChip[],
  model: Pick<ModelOption, "label" | "vision" | "tools"> | null,
  rules: AttachmentRules = {},
): string | null {
  if (attachments.length === 0) {
    return null;
  }
  const hasDocument = attachments.some((attachment) => attachment.kind === "document");
  if (hasDocument && !rules.documentsAllowed) {
    return "Documents belong to a project. Move this chat into a project or remove the file.";
  }
  if (hasDocument && !model?.tools) {
    return `${model?.label ?? "The selected model"} cannot read documents. Choose a model with tool support or remove the file.`;
  }
  const images = attachments.filter((attachment) => attachment.kind === "image");
  if (images.length > 0 && !model?.vision) {
    return `${model?.label ?? "The selected model"} cannot read images. Choose a vision model or remove the image.`;
  }
  const oversized = images.find(
    (attachment) => attachment.size !== null && attachment.size > MAX_IMAGE_BYTES,
  );
  return oversized ? `${oversized.name} is larger than 10 MB.` : null;
}

/** Reads the picked images off the JS thread-friendly File API and inlines them as base64. */
export async function readImageAttachments(
  attachments: readonly AttachmentChip[],
): Promise<ImageAttachment[]> {
  const images = attachments.filter((attachment) => attachment.kind === "image");
  return Promise.all(
    images.map(async (attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      base64: await new File(attachment.id).base64(),
    })),
  );
}
