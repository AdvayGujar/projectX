import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { IconName } from "../icons";
import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

const DEFAULT_EMPTY_TEXT = "No projects yet. Create one to group chats, files and artifacts.";

/** Project icons are stored as short names; an unknown or missing one falls back to a folder. */
const ICON_BY_NAME: Readonly<Record<string, IconName>> = {
  folder: "folder",
  layers: "layers",
  bubble: "bubble",
  pin: "pin",
  slides: "slides",
  image: "image",
};

export function projectIconName(name: string | null | undefined): IconName {
  return (name ? ICON_BY_NAME[name] : undefined) ?? "folder";
}

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly sessionCount: number;
}

export interface ProjectListProps {
  readonly projects: readonly ProjectListItem[];
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
  readonly emptyText?: string;
}

/** Project rows: icon, name, chat count. Same rhythm as `ProviderList`. */
export function ProjectList({
  projects,
  onSelect,
  onAdd,
  emptyText = DEFAULT_EMPTY_TEXT,
}: ProjectListProps): ReactElement {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {projects.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        projects.map((project) => (
          <Pressable
            key={project.id}
            accessibilityRole="button"
            accessibilityLabel={`${project.name}, ${chatCount(project.sessionCount)}`}
            onPress={() => onSelect(project.id)}
            style={styles.row}
          >
            <View style={styles.icon}>
              <Icon name={projectIconName(project.icon)} size={17} color={colors.textMuted} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.label} numberOfLines={1}>
                {project.name}
              </Text>
              <Text style={styles.meta}>{chatCount(project.sessionCount)}</Text>
            </View>
            <Icon name="chevron" size={14} color={colors.textFaint} />
          </Pressable>
        ))
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New project"
        onPress={onAdd}
        hitSlop={HIT_SLOP}
        style={styles.add}
      >
        <Icon name="plus" size={16} color={colors.text} />
        <Text style={styles.addLabel}>New project</Text>
      </Pressable>
    </ScrollView>
  );
}

function chatCount(count: number): string {
  return count === 1 ? "1 chat" : `${count} chats`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl, gap: space.sm },
  empty: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 44,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.raised,
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: typography.body, color: colors.text },
  meta: { fontSize: typography.small, color: colors.textMuted },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.raised,
  },
  addLabel: { fontSize: typography.body, color: colors.text },
});
