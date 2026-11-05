import type { ReactElement } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, radius, space, typography } from "../theme";

export interface ProjectMenuProps {
  readonly visible: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/** Anchored overflow for a project: edit and destructive delete. */
export function ProjectMenu({
  visible,
  title,
  onClose,
  onEdit,
  onDelete,
}: ProjectMenuProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        style={styles.scrim}
        onPress={onClose}
      >
        <View style={[styles.card, { top: insets.top + 82 }]}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>

          <MenuItem icon="pencil" label="Edit project" onPress={onEdit} />
          <MenuItem icon="trash" label="Delete project" onPress={onDelete} destructive />
        </View>
      </Pressable>
    </Modal>
  );
}

interface MenuItemProps {
  readonly icon: "pencil" | "trash";
  readonly label: string;
  readonly onPress: () => void;
  readonly destructive?: boolean;
}

function MenuItem({ icon, label, onPress, destructive = false }: MenuItemProps): ReactElement {
  const tint = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : undefined]}
    >
      <Icon name={icon} size={15} color={tint} />
      <Text style={[styles.itemLabel, destructive ? styles.itemLabelDanger : undefined]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  card: {
    position: "absolute",
    right: space.md,
    width: 216,
    borderRadius: radius.card + 2,
    backgroundColor: colors.composer,
    padding: 6,
  },
  title: {
    fontSize: typography.small,
    color: colors.textMuted,
    paddingHorizontal: space.sm,
    paddingTop: 6,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: space.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingVertical: 9,
    paddingHorizontal: space.sm,
    borderRadius: 7,
  },
  itemPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  itemLabel: { flex: 1, fontSize: 13, color: colors.text },
  itemLabelDanger: { color: colors.danger },
});
