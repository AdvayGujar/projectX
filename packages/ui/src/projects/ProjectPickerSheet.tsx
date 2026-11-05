import type { ReactElement } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { IconName } from "../icons";
import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import type { ProjectListItem } from "./ProjectList";
import { projectIconName } from "./ProjectList";

export interface ProjectPickerSheetProps {
  readonly visible: boolean;
  readonly projects: readonly ProjectListItem[];
  readonly selectedId: string | null;
  readonly onSelect: (projectId: string | null) => void;
  readonly onClose: () => void;
}

/** Moves a chat between projects. Standalone chats pick the first row. */
export function ProjectPickerSheet({
  visible,
  projects,
  selectedId,
  onSelect,
  onClose,
}: ProjectPickerSheetProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close project picker"
        style={styles.scrim}
        onPress={onClose}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.head}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={HIT_SLOP}
              onPress={onClose}
            >
              <Icon name="close" size={16} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>Add to project</Text>
            <View style={styles.headSpacer} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <ProjectRow
              name="No project"
              icon="bubble"
              selected={selectedId === null}
              onPress={() => onSelect(null)}
            />
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                name={project.name}
                icon={projectIconName(project.icon)}
                selected={project.id === selectedId}
                onPress={() => onSelect(project.id)}
              />
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

interface ProjectRowProps {
  readonly name: string;
  readonly icon: IconName;
  readonly selected: boolean;
  readonly onPress: () => void;
}

function ProjectRow({ name, icon, selected, onPress }: ProjectRowProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.icon}>
        <Icon name={icon} size={17} color={selected ? colors.text : colors.textMuted} />
      </View>
      <Text style={[styles.label, selected ? styles.labelSelected : undefined]} numberOfLines={1}>
        {name}
      </Text>
      {selected ? <Icon name="chevron" size={14} color={colors.text} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "70%",
    backgroundColor: colors.raised,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { fontSize: 13, fontWeight: "600", color: colors.text },
  headSpacer: { width: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 44,
    paddingVertical: space.sm,
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
  label: { flex: 1, fontSize: typography.body, color: colors.textMuted },
  labelSelected: { color: colors.text, fontWeight: "600" },
});
