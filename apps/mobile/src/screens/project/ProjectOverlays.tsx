import type { ProjectEditorInitial, ProjectEditorValues } from "@projectx/ui";
import {
  ConfirmDialog,
  ProjectEditorSheet,
  ProjectMenu,
  TextPromptDialog,
} from "@projectx/ui";
import type { ReactElement } from "react";

export interface ProjectMenuState {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export interface ProjectEditorState {
  readonly visible: boolean;
  readonly initial: ProjectEditorInitial;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (values: ProjectEditorValues) => void;
  readonly onClose: () => void;
}

export interface ProjectRemovalState {
  readonly visible: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export interface LibraryRemovalState {
  readonly visible: boolean;
  readonly name: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export interface LibraryLinkState {
  readonly visible: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (url: string) => void;
  readonly onClose: () => void;
}

export interface ProjectOverlaysProps {
  readonly projectName: string;
  readonly menu: ProjectMenuState;
  readonly editor: ProjectEditorState;
  readonly removal: ProjectRemovalState;
  readonly libraryRemoval: LibraryRemovalState;
  readonly link: LibraryLinkState;
}

/** Project and library dialogs, grouped so the screen stays readable. */
export function ProjectOverlays({
  projectName,
  menu,
  editor,
  removal,
  libraryRemoval,
  link,
}: ProjectOverlaysProps): ReactElement {
  return (
    <>
      <ProjectMenu
        visible={menu.visible}
        title={projectName}
        onClose={menu.onClose}
        onEdit={menu.onEdit}
        onDelete={menu.onDelete}
      />

      <ProjectEditorSheet
        visible={editor.visible}
        mode="edit"
        initial={editor.initial}
        busy={editor.busy}
        error={editor.error}
        onSubmit={editor.onSubmit}
        onClose={editor.onClose}
      />

      <ConfirmDialog
        visible={removal.visible}
        title={`Delete ${projectName}?`}
        message="Chats in this project become standalone chats. The project library is deleted, and artifacts move to the global list."
        confirmLabel="Delete"
        onConfirm={removal.onConfirm}
        onCancel={removal.onCancel}
      />

      <ConfirmDialog
        visible={libraryRemoval.visible}
        title={`Remove ${libraryRemoval.name}?`}
        message="This removes it from the project library. A saved link also deletes its page summary."
        confirmLabel="Remove"
        onConfirm={libraryRemoval.onConfirm}
        onCancel={libraryRemoval.onCancel}
      />

      <TextPromptDialog
        visible={link.visible}
        title="Add a link"
        label="Web address"
        initialValue=""
        placeholder="https://example.com/article"
        busy={link.busy}
        error={link.error}
        onSubmit={link.onSubmit}
        onClose={link.onClose}
      />
    </>
  );
}
