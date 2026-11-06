import type { FileRecord, ProjectLink } from "@projectx/core";
import {
  createFileRepository,
  createProjectLinkImporter,
  createProjectLinkRepository,
} from "@projectx/core";

import { getDbContext } from "../db/client";
import { ingestFile } from "./documentIngest";
import { createAppFileStorage } from "./fileStorage";
import { createAppWebFetch } from "./webFetch";

const FILE_CLEANUP_WARNING =
  "The file was removed, but its bytes could not be deleted.";
const LINK_CLEANUP_WARNING =
  "The link was removed, but its saved page could not be deleted.";

/** Library rows are files and links; a link's summary snapshot is never shown separately. */
export type ProjectLibraryItem =
  | { readonly kind: "file"; readonly file: FileRecord }
  | { readonly kind: "link"; readonly link: ProjectLink };

export interface AddProjectFileInput {
  readonly projectId: string;
  readonly sourceUri: string;
  readonly name: string;
  readonly mime: string;
  readonly size?: number | null;
}

export interface AddProjectLinkInput {
  readonly projectId: string;
  readonly url: string;
}

/** Files and links merged newest first, matching how the library reads. */
export async function listLibraryItems(
  projectId: string,
): Promise<readonly ProjectLibraryItem[]> {
  const context = await getDbContext();
  const [files, links] = await Promise.all([
    createFileRepository(context).listLibrary(projectId),
    createProjectLinkRepository(context).listByProject(projectId),
  ]);
  const items: ProjectLibraryItem[] = [
    ...files.map((file) => ({ kind: "file" as const, file })),
    ...links.map((link) => ({ kind: "link" as const, link })),
  ];
  return items.sort((left, right) => createdAt(right) - createdAt(left));
}

export async function addProjectFile(input: AddProjectFileInput): Promise<FileRecord> {
  const imported = await ingestFile(input);
  return imported.file;
}

export async function addProjectLink(input: AddProjectLinkInput): Promise<ProjectLink> {
  const context = await getDbContext();
  return createProjectLinkImporter(
    context,
    createAppWebFetch(),
    createAppFileStorage(),
  ).add(input);
}

/** Returns a cleanup warning when the rows are gone but the sandbox could not be cleaned. */
export async function removeProjectFile(fileId: string): Promise<string | null> {
  const context = await getDbContext();
  const files = createFileRepository(context);
  const file = await files.get(fileId);
  await files.remove(fileId);
  if (!file) {
    return null;
  }
  return removeBytes(file.path, FILE_CLEANUP_WARNING);
}

/** The link row and its summary snapshot go together; a media-only link has no snapshot. */
export async function removeProjectLink(linkId: string): Promise<string | null> {
  const context = await getDbContext();
  const links = createProjectLinkRepository(context);
  const link = await links.get(linkId);
  await links.remove(linkId);
  if (!link?.snapshotFileId) {
    return null;
  }
  const files = createFileRepository(context);
  const snapshot = await files.get(link.snapshotFileId);
  await files.remove(link.snapshotFileId);
  if (!snapshot) {
    return null;
  }
  return removeBytes(snapshot.path, LINK_CLEANUP_WARNING);
}

function createdAt(item: ProjectLibraryItem): number {
  return item.kind === "file" ? item.file.createdAt : item.link.createdAt;
}

async function removeBytes(
  relativePath: string,
  warning: string,
): Promise<string | null> {
  try {
    await createAppFileStorage().remove(relativePath);
    return null;
  } catch {
    return warning;
  }
}
