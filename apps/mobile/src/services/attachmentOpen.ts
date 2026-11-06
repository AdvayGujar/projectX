import type { LoadedAttachment } from "./sessionQueries";
import { loadAttachment } from "./sessionQueries";

export type AttachmentOpen =
  | { readonly kind: "viewer"; readonly attachment: LoadedAttachment }
  | { readonly kind: "document"; readonly fileId: string }
  | { readonly kind: "notice"; readonly message: string };

/**
 * Decides how a tapped transcript attachment opens. Images stay in the in-app viewer; a
 * document is handed to the OS through its stored file id, never by loading bytes.
 */
export async function planAttachmentOpen(
  messageId: string,
  index: number,
): Promise<AttachmentOpen> {
  const loaded = await loadAttachment(messageId, index);
  if (!loaded) {
    return { kind: "notice", message: "That attachment is no longer available." };
  }
  if (loaded.kind === "image") {
    return loaded.base64 === null
      ? { kind: "notice", message: "Could not read the attached image." }
      : { kind: "viewer", attachment: loaded };
  }
  return loaded.fileId === null
    ? { kind: "notice", message: "That document is no longer available." }
    : { kind: "document", fileId: loaded.fileId };
}
