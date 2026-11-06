import { AppError, createFileRepository } from "@projectx/core";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { getDbContext } from "../db/client";
import { createAppFileStorage } from "./fileStorage";

export type PreviewOutcome = "preview" | "shared";

const OPEN_DIALOG_TITLE = "Open in…";
const MISSING_USER_MESSAGE = "That file is no longer on this device.";
const NO_HANDLER_USER_MESSAGE = "No app on this device can open that file.";

/**
 * Presents a stored file with the platform viewer, falling back to the share sheet when the
 * platform cannot preview it. Both paths hand the file to another app; nothing is copied.
 */
export async function openStoredFile(
  relativePath: string,
  mimeType: string,
): Promise<PreviewOutcome> {
  const file = new File(createAppFileStorage().uriFor(relativePath));
  if (!file.exists) {
    throw new AppError("file_not_found", `File missing at ${relativePath}`, {
      userMessage: MISSING_USER_MESSAGE,
    });
  }
  if (await canPreview(file)) {
    await file.preview();
    return "preview";
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new AppError("unknown", "No preview or sharing handler available", {
      userMessage: NO_HANDLER_USER_MESSAGE,
    });
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: OPEN_DIALOG_TITLE });
  return "shared";
}

/** Looks up a stored file row and opens its bytes through the same preview path. */
export async function openFileById(fileId: string): Promise<PreviewOutcome> {
  const context = await getDbContext();
  const file = await createFileRepository(context).get(fileId);
  if (!file) {
    throw new AppError("file_not_found", `File ${fileId} not found`, {
      userMessage: "That file is no longer part of this project.",
    });
  }
  return openStoredFile(file.path, file.mime);
}

/**
 * `canPreview` rejects for files the platform cannot read, so a rejection is treated as
 * "not previewable" and the caller falls back to the share sheet.
 */
async function canPreview(file: File): Promise<boolean> {
  try {
    return await file.canPreview();
  } catch {
    return false;
  }
}
