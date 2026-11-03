import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardVisible } from "../primitives/useKeyboardVisible";

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
  const keyboardVisible = useKeyboardVisible();
  const [presetId, setPresetId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const selected = presets.find((preset) => preset.id === presetId);

  // Opening always starts clean: nothing selected, no key from a previous attempt.
  // `presets` is rebuilt by the caller on every render, so it is deliberately not a
  // dependency; only the open/close transition should reset the form.
  useEffect(() => {
    if (visible) {
      setPresetId("");
      setListOpen(false);
    }
    setApiKey("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const canSubmit = apiKey.trim().length > 0 && presetId.length > 0 && !busy;

  function close(): void {
    setApiKey("");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.scrim}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={close}
          />
        <View
          style={[
            styles.sheet,
            { paddingBottom: keyboardVisible ? space.lg : insets.bottom + space.xl },
          ]}
        >
          <View style={styles.head}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={HIT_SLOP} onPress={close}>
              <Icon name="close" size={16} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>Add provider</Text>
            <View style={styles.headSpacer} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Provider</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose provider"
              accessibilityState={{ expanded: listOpen }}
              onPress={() => setListOpen((open) => !open)}
              style={styles.select}
            >
              <Text style={styles.selectLabel}>{selected?.label ?? "Choose a provider"}</Text>
              <View style={listOpen ? styles.selectChevronOpen : undefined}>
                <Icon name="chevron" size={14} color={colors.textMuted} />
              </View>
            </Pressable>

            {listOpen ? (
              <View style={styles.dropdown}>
                {presets.map((preset) => {
                  const active = preset.id === presetId;
                  return (
                    <Pressable
                      key={preset.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setPresetId(preset.id);
                        setListOpen(false);
                      }}
                      style={[styles.option, active ? styles.optionActive : undefined]}
                    >
                      <Text style={[styles.optionLabel, active ? styles.optionLabelActive : undefined]}>
                        {preset.label}
                      </Text>
                      {active ? <Icon name="chevron" size={13} color={colors.text} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.card,
    backgroundColor: colors.canvas,
    paddingVertical: 11,
    paddingHorizontal: space.md,
  },
  selectLabel: { fontSize: typography.label, color: colors.text },
  selectChevronOpen: { transform: [{ rotate: "90deg" }] },
  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.card,
    backgroundColor: colors.canvas,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  optionActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  optionLabel: { fontSize: typography.label, color: colors.textMuted },
  optionLabelActive: { color: colors.text },
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
