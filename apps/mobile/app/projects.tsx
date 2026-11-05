import type { ProjectWithCount } from "@projectx/core";
import type { ProjectEditorInitial, ProjectEditorValues } from "@projectx/ui";
import {
  Icon,
  ProjectEditorSheet,
  ProjectList,
  colors,
  HIT_SLOP,
  radius,
  space,
  typography,
} from "@projectx/ui";
import { useFocusEffect, useRouter } from "expo-router";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../src/navigation/useOpenDrawer";
import { describeError } from "../src/services/errorMessage";
import { createProject, listProjects } from "../src/services/projectService";

const EMPTY_PROJECT: ProjectEditorInitial = { name: "", icon: null, instructions: "" };

export default function ProjectsRoute(): ReactElement {
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();
  const router = useRouter();

  const [projects, setProjects] = useState<readonly ProjectWithCount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setProjects(await listProjects());
      setNotice(null);
    } catch (failure) {
      setNotice(describeError(failure, "Could not load projects."));
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function create(values: ProjectEditorValues): Promise<void> {
    setBusy(true);
    setFormError(null);
    try {
      await createProject({
        name: values.name,
        icon: values.icon,
        instructions: values.instructions,
      });
      await reload();
      setSheetOpen(false);
    } catch (failure) {
      setFormError(describeError(failure, "Could not create the project."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open navigation"
          hitSlop={HIT_SLOP}
          onPress={openDrawer}
          style={styles.iconButton}
        >
          <Icon name="menu" size={19} color={colors.text} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Projects
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New project"
          hitSlop={HIT_SLOP}
          onPress={() => {
            setFormError(null);
            setSheetOpen(true);
          }}
          style={styles.iconButton}
        >
          <Icon name="plus" size={19} color={colors.text} />
        </Pressable>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ProjectList
        projects={projects}
        emptyText={loaded ? undefined : "Loading projects…"}
        onSelect={(id) => router.push({ pathname: "/project/[id]", params: { id } })}
        onAdd={() => {
          setFormError(null);
          setSheetOpen(true);
        }}
      />

      <ProjectEditorSheet
        visible={sheetOpen}
        mode="create"
        initial={EMPTY_PROJECT}
        busy={busy}
        error={formError}
        onSubmit={(values) => {
          void create(values);
        }}
        onClose={() => {
          setFormError(null);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "600", color: colors.text },
  notice: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    fontSize: typography.label,
    lineHeight: 18,
    color: colors.danger,
  },
});
