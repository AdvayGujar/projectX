import type { ProjectWithCount } from "@projectx/core";
import type { ProjectListItem } from "@projectx/ui";
import {
  ConfirmDialog,
  ProjectPickerSheet,
  SessionMenu,
  TextPromptDialog,
} from "@projectx/ui";
import { useRouter } from "expo-router";
import type { ReactElement } from "react";
import { useState } from "react";

import { describeError } from "../../services/errorMessage";
import { listProjects } from "../../services/projectService";
import {
  deleteSession,
  renameSession,
  setSessionPinned,
  setSessionProject,
} from "../../services/sessionQueries";
import { useSessionsStore } from "../../state/sessionsStore";

export interface SessionActionsProps {
  readonly sessionId: string;
  readonly title: string;
  readonly muted: boolean;
  readonly pinned: boolean;
  readonly projectId: string | null;
  readonly menuOpen: boolean;
  readonly onCloseMenu: () => void;
  readonly onToggleMute: () => void;
  readonly onTitleChange: (title: string) => void;
  readonly onPinnedChange: (pinned: boolean) => void;
  readonly onProjectChange: (projectId: string | null) => void;
  readonly onNotice: (message: string) => void;
}

/** The session menu plus the three flows it can open. Only one modal is ever visible. */
export function SessionActions({
  sessionId,
  title,
  muted,
  pinned,
  projectId,
  menuOpen,
  onCloseMenu,
  onToggleMute,
  onTitleChange,
  onPinnedChange,
  onProjectChange,
  onNotice,
}: SessionActionsProps): ReactElement {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projects, setProjects] = useState<readonly ProjectListItem[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function refreshRecents(): void {
    void useSessionsStore.getState().refresh();
  }

  function openRename(): void {
    onCloseMenu();
    setRenameError(null);
    setRenameOpen(true);
  }

  async function submitRename(nextTitle: string): Promise<void> {
    setRenameBusy(true);
    setRenameError(null);
    try {
      await renameSession(sessionId, nextTitle);
      onTitleChange(nextTitle);
      setRenameOpen(false);
      refreshRecents();
    } catch (failure) {
      setRenameError(describeError(failure, "Could not rename this chat."));
    } finally {
      setRenameBusy(false);
    }
  }

  async function togglePin(): Promise<void> {
    onCloseMenu();
    try {
      await setSessionPinned(sessionId, !pinned);
      onPinnedChange(!pinned);
      refreshRecents();
    } catch (failure) {
      onNotice(describeError(failure, "Could not update the pin."));
    }
  }

  function openProjectPicker(): void {
    onCloseMenu();
    setPickerOpen(true);
    void loadProjects();
  }

  async function loadProjects(): Promise<void> {
    try {
      setProjects((await listProjects()).map(toListItem));
    } catch (failure) {
      onNotice(describeError(failure, "Could not load projects."));
    }
  }

  async function selectProject(nextProjectId: string | null): Promise<void> {
    setPickerOpen(false);
    try {
      await setSessionProject(sessionId, nextProjectId);
      onProjectChange(nextProjectId);
      refreshRecents();
    } catch (failure) {
      onNotice(describeError(failure, "Could not move this chat."));
    }
  }

  function openDelete(): void {
    onCloseMenu();
    setDeleteOpen(true);
  }

  async function confirmDelete(): Promise<void> {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      const { cleanupWarning } = await deleteSession(sessionId);
      setDeleteOpen(false);
      refreshRecents();
      if (cleanupWarning) {
        // The chat row is already gone, so a dirty sandbox must not block leaving the
        // screen. Show the warning for the frame before navigation replaces this route.
        onNotice(cleanupWarning);
      }
      router.replace("/");
    } catch (failure) {
      setDeleteOpen(false);
      onNotice(describeError(failure, "Could not delete this chat."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SessionMenu
        visible={menuOpen}
        title={title || "Untitled"}
        muted={muted}
        pinned={pinned}
        onClose={onCloseMenu}
        onToggleMute={onToggleMute}
        onRename={openRename}
        onPin={() => {
          void togglePin();
        }}
        onAddToProject={openProjectPicker}
        onDelete={openDelete}
      />

      <TextPromptDialog
        visible={renameOpen}
        title="Rename chat"
        label="Chat title"
        initialValue={title}
        placeholder="Chat title"
        busy={renameBusy}
        error={renameError}
        onSubmit={(value) => {
          void submitRename(value);
        }}
        onClose={() => {
          setRenameError(null);
          setRenameOpen(false);
        }}
      />

      <ProjectPickerSheet
        visible={pickerOpen}
        projects={projects}
        selectedId={projectId}
        onSelect={(id) => {
          void selectProject(id);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        visible={deleteOpen}
        title="Delete chat?"
        message="This chat and its messages will be removed. Artifacts in a project stay with the project; standalone files are removed."
        confirmLabel="Delete"
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}

function toListItem(project: ProjectWithCount): ProjectListItem {
  return {
    id: project.id,
    name: project.name,
    icon: project.icon,
    sessionCount: project.sessionCount,
  };
}
