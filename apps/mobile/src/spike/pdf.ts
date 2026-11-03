import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { extractTextWithInfo, isAvailable } from "expo-pdf-text-extract";

import type { SpikeResult } from "./types";

export async function extractPdfAt(uri: string): Promise<SpikeResult> {
  if (!isAvailable()) {
    throw new Error("native PDF module unavailable");
  }

  const started = Date.now();
  const result = await extractTextWithInfo(uri);
  const note = result.passwordRequired ? ", password required" : "";

  return {
    label: "PDF read",
    detail: `${result.pageCount} pages, ${result.text.length} chars${note}`,
    ms: Date.now() - started,
  };
}

export async function extractPickedPdf(): Promise<SpikeResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) {
    throw new Error("cancelled");
  }
  const asset = picked.assets[0];
  if (!asset) {
    throw new Error("no file selected");
  }
  return extractPdfAt(asset.uri);
}

export async function extractFixturePdf(): Promise<SpikeResult> {
  const directory = FileSystem.documentDirectory;
  if (!directory) {
    throw new Error("document directory unavailable");
  }
  return extractPdfAt(`${directory}large.pdf`);
}
