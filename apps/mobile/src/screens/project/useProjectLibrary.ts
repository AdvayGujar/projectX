import * as DocumentPicker from "expo-document-picker";
import { useCallback, useState } from "react";

import { describeError } from "../../services/errorMessage";
import type { ProjectLibraryItem } from "../../services/projectLibraryService";
import {
  addProjectFile,
  addProjectLink,
  listLibraryItems,
  removeProjectFile,
  removeProjectLink,
} from "../../services/projectLibraryService";

export interface LibraryRemoval {
  readonly kind: "file" | "link";
  readonly id: string;
  readonly name: string;
}

export interface ProjectLibraryController {
  readonly items: readonly ProjectLibraryItem[];
  readonly notice: string | null;
  readonly fileBusy: boolean;
  readonly linkOpen: boolean;
  readonly linkBusy: boolean;
  readonly linkError: string | null;
  readonly removal: LibraryRemoval | null;
  readonly setItems: (items: readonly ProjectLibraryItem[]) => void;
  addFile(): Promise<void>;
  openLink(): void;
  closeLink(): void;
  submitLink(url: string): Promise<void>;
  requestRemoval(item: ProjectLibraryItem): void;
  cancelRemoval(): void;
  confirmRemoval(): Promise<void>;
}

/** Owns the library's state and the picker/fetch/cleanup flows, keeping the screen declarative. */
export function useProjectLibrary(projectId: string): ProjectLibraryController {
  const [items, setItems] = useState<readonly ProjectLibraryItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [removal, setRemoval] = useState<LibraryRemoval | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setItems(await listLibraryItems(projectId));
  }, [projectId]);

  const addFile = useCallback(async (): Promise<void> => {
    setNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) {
        return;
      }
      setFileBusy(true);
      await addProjectFile({
        projectId,
        sourceUri: asset.uri,
        name: asset.name,
        mime: asset.mimeType ?? "application/octet-stream",
        size: asset.size ?? null,
      });
      await refresh();
    } catch (failure) {
      setNotice(describeError(failure, "Could not add the file."));
    } finally {
      setFileBusy(false);
    }
  }, [projectId, refresh]);

  const openLink = useCallback((): void => {
    setLinkError(null);
    setLinkOpen(true);
  }, []);

  const closeLink = useCallback((): void => {
    setLinkOpen(false);
    setLinkError(null);
  }, []);

  const submitLink = useCallback(
    async (url: string): Promise<void> => {
      setLinkBusy(true);
      setLinkError(null);
      try {
        await addProjectLink({ projectId, url });
        setLinkOpen(false);
        await refresh();
      } catch (failure) {
        setLinkError(describeError(failure, "Could not save that link."));
      } finally {
        setLinkBusy(false);
      }
    },
    [projectId, refresh],
  );

  const requestRemoval = useCallback((item: ProjectLibraryItem): void => {
    setRemoval(
      item.kind === "file"
        ? { kind: "file", id: item.file.id, name: item.file.name }
        : { kind: "link", id: item.link.id, name: item.link.title },
    );
  }, []);

  const cancelRemoval = useCallback((): void => {
    setRemoval(null);
  }, []);

  const confirmRemoval = useCallback(async (): Promise<void> => {
    if (!removal) {
      return;
    }
    const target = removal;
    setRemoval(null);
    setNotice(null);
    try {
      const cleanupWarning =
        target.kind === "file"
          ? await removeProjectFile(target.id)
          : await removeProjectLink(target.id);
      await refresh();
      if (cleanupWarning) {
        setNotice(cleanupWarning);
      }
    } catch (failure) {
      setNotice(describeError(failure, "Could not remove that item."));
    }
  }, [removal, refresh]);

  return {
    items,
    notice,
    fileBusy,
    linkOpen,
    linkBusy,
    linkError,
    removal,
    setItems,
    addFile,
    openLink,
    closeLink,
    submitLink,
    requestRemoval,
    cancelRemoval,
    confirmRemoval,
  };
}
