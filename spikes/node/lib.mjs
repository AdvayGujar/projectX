import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

export const outDir = fileURLToPath(new URL("../out/", import.meta.url));
export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function ensureOut() {
  await mkdir(outDir, { recursive: true });
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function readZip(filePath) {
  const data = await readFile(filePath);
  return JSZip.loadAsync(data);
}

export async function fileSize(filePath) {
  return (await stat(filePath)).size;
}

export function names(zip, pattern) {
  return Object.keys(zip.files).filter((name) => pattern.test(name));
}

export async function zipText(zip, name) {
  const entry = zip.file(name);
  assert(entry, `missing zip entry: ${name}`);
  return entry.async("string");
}
