import type { ReactElement } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, radius, space, typography } from "../theme";

export interface ProviderMenuProps {
  readonly visible: boolean;
  readonly label: string;
  readonly detail: string;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

/** Opened by tapping a provider row. Deleting removes the key and the cached models. */
export function ProviderMenu({
  visible,
  label,
  detail,
  onDelete,
  onClose,
}: ProviderMenuProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.scrim} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.detail}>{detail}</Text>

          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            style={({ pressed }) => [styles.action, pressed ? styles.actionPressed : undefined]}
          >
            <Icon name="trash" size={16} color={colors.danger} />
            <Text style={styles.deleteLabel}>Delete provider</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
  },
  label: { fontSize: typography.body, fontWeight: "600", color: colors.text },
  detail: { fontSize: typography.small, color: colors.textMuted, marginTop: 2, marginBottom: space.md },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.card,
  },
  actionPressed: { backgroundColor: "rgba(248,113,113,0.10)" },
  deleteLabel: { fontSize: typography.body, color: colors.danger },
  cancel: { alignItems: "center", paddingVertical: space.md },
  cancelLabel: { fontSize: typography.body, color: colors.textMuted },
});
