import type { ReactElement } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, typography } from "../theme";

export interface ConfirmDialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** One destructive confirmation. Card over a scrim, actions side by side. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={[styles.button, styles.confirmButton]}
            >
              <Text style={styles.confirmLabel}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: "center", justifyContent: "center", padding: space.xxl },
  card: {
    width: "100%",
    borderRadius: radius.sheet,
    backgroundColor: colors.raised,
    padding: space.lg,
    gap: space.sm,
  },
  title: { fontSize: typography.body, fontWeight: "600", color: colors.text },
  message: { fontSize: typography.label, lineHeight: 19, color: colors.textMuted },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.sm },
  button: {
    paddingVertical: 9,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.composer,
  },
  confirmButton: { backgroundColor: colors.danger },
  cancelLabel: { fontSize: typography.label, color: colors.text },
  confirmLabel: { fontSize: typography.label, fontWeight: "600", color: colors.canvas },
});
