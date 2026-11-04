import type { AttachmentChip, ModelOption } from "@projectx/ui";
import { File } from "expo-file-system";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ImageAttachment {
  readonly name: string;
  readonly mimeType: string;
  readonly base64: string;
}

/**
 * The single capability gate for attachments (D12). Documents are blocked until the
 * extraction pipeline can hand the model text; images need a vision model.
 */
export function attachmentProblem(
  attachments: readonly AttachmentChip[],
  model: Pick<ModelOption, "label" | "vision"> | null,
): string | null {
  if (attachments.length === 0) {
    return null;
  }
  if (attachments.some((attachment) => attachment.kind === "document")) {
    return "Documents can't be read yet. Remove the file or attach an image.";
  }
  if (!model?.vision) {
    return `${model?.label ?? "The selected model"} cannot read images. Choose a vision model or remove the image.`;
  }
  const oversized = attachments.find(
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
