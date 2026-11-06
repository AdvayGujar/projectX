import type { ProjectSessionSummary, ProjectTabKey } from "@projectx/ui";
import { Icon, ProjectSessionList, colors, radius, space, typography } from "@projectx/ui";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface ProjectSessionsPanelProps {
  readonly sessions: readonly ProjectSessionSummary[];
  readonly onSelect: (id: string) => void;
  readonly onNewChat: () => void;
}

export function ProjectSessionsPanel({
  sessions,
  onSelect,
  onNewChat,
}: ProjectSessionsPanelProps): ReactElement {
  return (
    <View style={styles.fill}>
      <ProjectSessionList sessions={sessions} onSelect={onSelect} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New chat in project"
        onPress={onNewChat}
        style={styles.newChat}
      >
        <Icon name="plus" size={16} color={colors.canvas} />
        <Text style={styles.newChatLabel}>New chat in project</Text>
      </Pressable>
    </View>
  );
}

/** Memory and artifacts are owned by later milestones; the tab explains which. */
export function PlaceholderPanel({ tab }: { readonly tab: ProjectTabKey }): ReactElement {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{placeholderFor(tab)}</Text>
    </View>
  );
}

function placeholderFor(tab: ProjectTabKey): string {
  if (tab === "memory") {
    return "Project memory arrives with memory v1 (M5).";
  }
  if (tab === "artifacts") {
    return "Project artifacts arrive with the artifact canvas (M4).";
  }
  return "The project library is ready.";
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  newChat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 44,
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.text,
  },
  newChatLabel: { fontSize: typography.body, fontWeight: "600", color: colors.canvas },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
  },
  placeholderText: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
    textAlign: "center",
  },
});
