import type { ReactElement } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, radius, space, typography } from "../theme";

export interface SessionMenuProps {
  readonly visible: boolean;
  readonly title: string;
  readonly muted: boolean;
  readonly pinned: boolean;
  readonly onClose: () => void;
  readonly onToggleMute: () => void;
  readonly onRename: () => void;
  readonly onPin: () => void;
  readonly onAddToProject: () => void;
  readonly onDelete: () => void;
}

/** Anchored overflow per UI_SPEC.md §7. Four actions plus the mute toggle. */
export function SessionMenu({
  visible,
  title,
  muted,
  pinned,
  onClose,
  onToggleMute,
  onRename,
  onPin,
  onAddToProject,
  onDelete,
}: SessionMenuProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={styles.scrim} onPress={onClose}>
        <View style={[styles.card, { top: insets.top + 82 }]}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>

          <MenuItem icon="mute" label="Mute" onPress={onToggleMute} trailing={<MuteSwitch on={muted} />} />
          <MenuItem icon="pencil" label="Rename" onPress={onRename} />
          <MenuItem icon="pin" label={pinned ? "Unpin" : "Pin"} onPress={onPin} />
          <MenuItem icon="folder" label="Add to project" onPress={onAddToProject} />
          <MenuItem icon="trash" label="Delete" onPress={onDelete} destructive />
        </View>
      </Pressable>
    </Modal>
  );
}

interface MenuItemProps {
  readonly icon: "mute" | "pencil" | "pin" | "folder" | "trash";
  readonly label: string;
  readonly onPress: () => void;
  readonly destructive?: boolean;
  readonly trailing?: ReactElement;
}

function MenuItem({ icon, label, onPress, destructive = false, trailing }: MenuItemProps): ReactElement {
  const tint = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : undefined]}
    >
      <Icon name={icon} size={15} color={tint} />
      <Text style={[styles.itemLabel, destructive ? styles.itemLabelDanger : undefined]}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

function MuteSwitch({ on }: { readonly on: boolean }): ReactElement {
  return (
    <View style={[styles.track, on ? styles.trackOn : undefined]}>
      <View style={[styles.knob, on ? styles.knobOn : undefined]} />
    </View>
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
    paddingVertical: 9,
    paddingHorizontal: space.sm,
    borderRadius: 7,
  },
  itemPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  itemLabel: { flex: 1, fontSize: 13, color: colors.text },
  itemLabelDanger: { color: colors.danger },
  track: {
    width: 26,
    height: 15,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  trackOn: { backgroundColor: "rgba(255,255,255,0.25)", alignItems: "flex-end" },
  knob: { width: 11, height: 11, borderRadius: radius.pill, backgroundColor: colors.textFaint },
  knobOn: { backgroundColor: colors.text },
});
