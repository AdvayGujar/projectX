import type { ProjectEditorInitial, ProjectEditorValues } from "@projectx/ui";
import { ConfirmDialog, ProjectEditorSheet, ProjectMenu } from "@projectx/ui";
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

export interface ProjectOverlaysProps {
  readonly projectName: string;
  readonly menu: ProjectMenuState;
  readonly editor: ProjectEditorState;
  readonly removal: ProjectRemovalState;
}

/** Project menu, edit sheet and delete confirmation, grouped so the screen stays readable. */
export function ProjectOverlays({
  projectName,
  menu,
  editor,
  removal,
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
        message="Chats in this project become standalone chats. Project library files are deleted later, when the project library lands."
        confirmLabel="Delete"
        onConfirm={removal.onConfirm}
        onCancel={removal.onCancel}
      />
    </>
  );
}
