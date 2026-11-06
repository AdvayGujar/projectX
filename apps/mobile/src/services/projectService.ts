import type {
  CreateProjectInput,
  Project,
  ProjectWithCount,
  Session,
  UpdateProjectInput,
} from "@projectx/core";
import { createProjectRepository, createSessionRepository, projectDirectory } from "@projectx/core";

import { getDbContext } from "../db/client";
import { createAppFileStorage } from "./fileStorage";

const PROJECT_CLEANUP_WARNING =
  "The project was deleted, but its library files could not be removed.";

export interface CreateProjectSessionInput {
  readonly projectId: string;
  readonly selectionId: string;
  readonly title?: string;
}

/** Projects with their chat count, most recently updated first. */
export async function listProjects(): Promise<ProjectWithCount[]> {
  const context = await getDbContext();
  return createProjectRepository(context).listWithCounts();
}

export async function getProject(id: string): Promise<Project | null> {
  const context = await getDbContext();
  return createProjectRepository(context).get(id);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const context = await getDbContext();
  return createProjectRepository(context).create(input);
}

export async function updateProject(id: string, patch: UpdateProjectInput): Promise<Project> {
  const context = await getDbContext();
  return createProjectRepository(context).update(id, patch);
}

/**
 * Removing a project leaves its chats standalone; the foreign key clears `project_id`.
 * Library rows cascade with the project, then the sandbox folder is removed. A cleanup
 * failure is reported, not thrown, so a dirty sandbox never restores a deleted project.
 */
export async function deleteProject(id: string): Promise<{ cleanupWarning: string | null }> {
  const context = await getDbContext();
  await createProjectRepository(context).remove(id);
  try {
    await createAppFileStorage().removeDirectory(projectDirectory(id));
    return { cleanupWarning: null };
  } catch {
    return { cleanupWarning: PROJECT_CLEANUP_WARNING };
  }
}

export async function listProjectSessions(projectId: string): Promise<Session[]> {
  const context = await getDbContext();
  return createSessionRepository(context).listByProject(projectId);
}

/**
 * Starts an empty chat inside a project with the currently selected model. The selection id
 * is `providerId:modelId`, the same shape the chat screen splits before creating a session.
 * Returns null when the selection cannot be parsed.
 */
export async function createSessionInProject(
  input: CreateProjectSessionInput,
): Promise<string | null> {
  const selection = parseSelection(input.selectionId);
  if (!selection) {
    return null;
  }
  const context = await getDbContext();
  const session = await createSessionRepository(context).create({
    projectId: input.projectId,
    ...(input.title ? { title: input.title } : {}),
    providerId: selection.providerId,
    modelId: selection.modelId,
  });
  return session.id;
}

interface ParsedSelection {
  readonly providerId: string;
  readonly modelId: string;
}

function parseSelection(selectionId: string): ParsedSelection | null {
  const separator = selectionId.indexOf(":");
  if (separator <= 0 || separator === selectionId.length - 1) {
    return null;
  }
  return {
    providerId: selectionId.slice(0, separator),
    modelId: selectionId.slice(separator + 1),
  };
}
