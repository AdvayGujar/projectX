import type { ReactElement } from "react";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

export interface ProviderPresetSummary {
  readonly id: string;
  readonly label: string;
  readonly keyHint: string;
}

export interface AddProviderSheetProps {
  readonly visible: boolean;
  readonly presets: readonly ProviderPresetSummary[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: { presetId: string; apiKey: string }) => void;
  readonly onClose: () => void;
}

/**
 * The key is typed straight into the field and handed to the caller; it is never rendered
 * again, logged, or stored outside the keychain.
 */
export function AddProviderSheet({
  visible,
  presets,
  busy,
  error,
  onSubmit,
  onClose,
}: AddProviderSheetProps): ReactElement {
  const insets = useSafeAreaInsets();
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");

  const selected = presets.find((preset) => preset.id === presetId);
  const canSubmit = apiKey.trim().length > 0 && presetId.length > 0 && !busy;

  function close(): void {
    setApiKey("");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.scrim} onPress={close}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.head}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={HIT_SLOP} onPress={close}>
              <Icon name="close" size={16} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>Add provider</Text>
            <View style={styles.headSpacer} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Provider</Text>
            <View style={styles.presets}>
              {presets.map((preset) => {
                const active = preset.id === presetId;
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setPresetId(preset.id)}
                    style={[styles.preset, active ? styles.presetActive : undefined]}
                  >
                    <Text style={[styles.presetLabel, active ? styles.presetLabelActive : undefined]}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>API key</Text>
            <TextInput
              accessibilityLabel="API key"
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder={selected?.keyHint ?? "Paste the key"}
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <Text style={styles.hint}>
              Stored in the system keychain. It never reaches the database, logs, or backups.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={() => onSubmit({ presetId, apiKey: apiKey.trim() })}
              style={[styles.submit, canSubmit ? undefined : styles.submitDisabled]}
            >
              <Text style={styles.submitLabel}>{busy ? "Checking key…" : "Validate and save"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "82%",
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
  sectionLabel: {
    marginTop: space.md,
    marginBottom: space.sm,
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.textFaint,
  },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  preset: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: space.md,
  },
  presetActive: { backgroundColor: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.28)" },
  presetLabel: { fontSize: typography.label, color: colors.textMuted },
  presetLabelActive: { color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.card,
    backgroundColor: colors.canvas,
    paddingVertical: 11,
    paddingHorizontal: space.md,
    fontSize: typography.label,
    color: colors.text,
  },
  hint: {
    marginTop: space.sm,
    fontSize: typography.small,
    lineHeight: 16,
    color: colors.textFaint,
  },
  error: {
    marginTop: space.md,
    fontSize: typography.label,
    lineHeight: 18,
    color: colors.danger,
  },
  submit: {
    marginTop: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.text,
    paddingVertical: 13,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.4 },
  submitLabel: { fontSize: typography.body, fontWeight: "600", color: colors.canvas },
});
