import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, space, typography } from "../theme";

export interface TextPromptDialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly label: string;
  readonly initialValue: string;
  readonly placeholder?: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (value: string) => void;
  readonly onClose: () => void;
}

/** One-line text prompt. Same rhythm as `ConfirmDialog`, with room for the keyboard. */
export function TextPromptDialog({
  visible,
  title,
  label,
  initialValue,
  placeholder,
  busy,
  error,
  onSubmit,
  onClose,
}: TextPromptDialogProps): ReactElement {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [visible, initialValue]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !busy;

  function save(): void {
    if (canSave) {
      onSubmit(trimmed);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.scrim,
            { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl },
          ]}
        >
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>

            <Text style={styles.label}>{label}</Text>
            <TextInput
              accessibilityLabel={label}
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={save}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save"
                accessibilityState={{ disabled: !canSave }}
                disabled={!canSave}
                onPress={save}
                style={[styles.button, styles.saveButton, canSave ? undefined : styles.disabled]}
              >
                <Text style={styles.saveLabel}>{busy ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
  },
  card: {
    width: "100%",
    borderRadius: radius.sheet,
    backgroundColor: colors.raised,
    padding: space.lg,
    gap: space.sm,
  },
  title: { fontSize: typography.body, fontWeight: "600", color: colors.text },
  label: { fontSize: typography.label, color: colors.textMuted },
  input: {
    minHeight: 44,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.composer,
    paddingHorizontal: space.md,
    fontSize: typography.body,
    color: colors.text,
  },
  error: { fontSize: typography.label, lineHeight: 18, color: colors.danger },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.sm },
  button: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.composer,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: { backgroundColor: colors.text },
  disabled: { opacity: 0.4 },
  cancelLabel: { fontSize: typography.label, color: colors.text },
  saveLabel: { fontSize: typography.label, fontWeight: "600", color: colors.canvas },
});
