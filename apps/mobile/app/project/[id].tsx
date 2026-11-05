import type { Project, Session } from "@projectx/core";
import type {
  ProjectEditorInitial,
  ProjectEditorValues,
  ProjectSessionSummary,
  ProjectTabKey,
} from "@projectx/ui";
import {
  ProjectHeader,
  ProjectTabs,
  colors,
  space,
  typography,
} from "@projectx/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../../src/navigation/useOpenDrawer";
import { ProjectOverlays } from "../../src/screens/project/ProjectOverlays";
import { PlaceholderPanel, ProjectSessionsPanel } from "../../src/screens/project/ProjectPanels";
import { describeError } from "../../src/services/errorMessage";
import {
  createSessionInProject,
  deleteProject,
  getProject,
  listProjectSessions,
  updateProject,
} from "../../src/services/projectService";
import { useModelCatalog } from "../../src/state/useModelCatalog";
import { useModelStore } from "../../src/state/modelStore";

export default function ProjectScreen(): ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = params.id ?? "";
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();
  const router = useRouter();
  const currentModel = useModelStore((state) => state.current);
  useModelCatalog();

  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<readonly Session[]>([]);
  const [tab, setTab] = useState<ProjectTabKey>("sessions");
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [found, chats] = await Promise.all([
        getProject(projectId),
        listProjectSessions(projectId),
      ]);
      if (!found) {
        setProject(null);
        setSessions([]);
        setNotice("Project not found.");
        return;
      }
      setProject(found);
      setSessions(chats);
      setNotice(null);
    } catch (failure) {
      setNotice(describeError(failure, "Could not open this project."));
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const sessionSummaries = useMemo<readonly ProjectSessionSummary[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        pinned: session.pinned,
        lastActivityAt: session.lastMessageAt,
      })),
    [sessions],
  );

  const editorInitial = useMemo<ProjectEditorInitial>(
    () => ({
      name: project?.name ?? "",
      icon: project?.icon ?? null,
      instructions: project?.instructions ?? "",
    }),
    [project],
  );

  async function save(values: ProjectEditorValues): Promise<void> {
    if (!project) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await updateProject(project.id, values);
      await reload();
      setEditorOpen(false);
    } catch (failure) {
      setFormError(describeError(failure, "Could not save the project."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!project) {
      return;
    }
    try {
      await deleteProject(project.id);
      setDeleteOpen(false);
      router.replace("/projects");
    } catch (failure) {
      setDeleteOpen(false);
      setNotice(describeError(failure, "Could not delete the project."));
    }
  }

  async function newChat(): Promise<void> {
    if (!project) {
      return;
    }
    if (!currentModel) {
      setNotice("Add a provider and choose a model before starting a chat.");
      return;
    }
    try {
      const sessionId = await createSessionInProject({
        projectId: project.id,
        selectionId: currentModel.id,
      });
      if (!sessionId) {
        setNotice("That model selection is not usable. Pick it again.");
        return;
      }
      router.push({ pathname: "/session/[id]", params: { id: sessionId } });
    } catch (failure) {
      setNotice(describeError(failure, "Could not start the chat."));
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ProjectHeader
        title={project?.name ?? "Project"}
        onOpenDrawer={openDrawer}
        onOpenMenu={() => setMenuOpen(true)}
      />

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {project ? (
        <>
          <ProjectTabs active={tab} onSelect={setTab} />

          <View style={styles.panel}>
            {tab === "sessions" ? (
              <ProjectSessionsPanel
                sessions={sessionSummaries}
                onSelect={(id) => router.push({ pathname: "/session/[id]", params: { id } })}
                onNewChat={() => {
                  void newChat();
                }}
              />
            ) : (
              <PlaceholderPanel tab={tab} />
            )}
          </View>
        </>
      ) : null}

      <ProjectOverlays
        projectName={project?.name ?? "project"}
        menu={{
          visible: menuOpen,
          onClose: () => setMenuOpen(false),
          onEdit: () => {
            setMenuOpen(false);
            setFormError(null);
            setEditorOpen(true);
          },
          onDelete: () => {
            setMenuOpen(false);
            setDeleteOpen(true);
          },
        }}
        editor={{
          visible: editorOpen,
          initial: editorInitial,
          busy,
          error: formError,
          onSubmit: (values) => {
            void save(values);
          },
          onClose: () => {
            setFormError(null);
            setEditorOpen(false);
          },
        }}
        removal={{
          visible: deleteOpen,
          onConfirm: () => {
            void remove();
          },
          onCancel: () => setDeleteOpen(false),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  notice: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    fontSize: typography.label,
    lineHeight: 18,
    color: colors.danger,
  },
  panel: { flex: 1 },
});
