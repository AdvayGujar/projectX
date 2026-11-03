import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardVisible } from "../primitives/useKeyboardVisible";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import type { AttachmentChip } from "../types";

export interface ComposerProps {
  readonly value: string;
  readonly attachments: readonly AttachmentChip[];
  readonly onRemoveAttachment: (id: string) => void;
  readonly placeholder: string;
  readonly think: boolean;
  readonly search: boolean;
  readonly onChangeText: (value: string) => void;
  readonly onToggleThink: () => void;
  readonly onToggleSearch: () => void;
  readonly onAttach: () => void;
  readonly onSend: () => void;
  readonly onRecord: () => void;
}

/**
 * Pinned to the bottom, never scrolls with the transcript (UI_SPEC.md §4).
 * Two rows: mode toggles, then attach · input · one record button.
 */
export function Composer({
  value,
  attachments,
  onRemoveAttachment,
  placeholder,
  think,
  search,
  onChangeText,
  onToggleThink,
  onToggleSearch,
  onAttach,
  onSend,
  onRecord,
}: ComposerProps): ReactElement {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const canSend = value.trim().length > 0;

  return (
    <View
      style={[styles.wrap, { paddingBottom: (keyboardVisible ? 0 : insets.bottom) + space.sm }]}
    >
      <View style={styles.composer}>
        {attachments.length > 0 ? (
          <View style={styles.attachments}>
            {attachments.map((attachment) => (
              <View key={attachment.id} style={styles.attachment}>
                <Icon name="attach" size={12} color={colors.textMuted} />
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {attachment.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${attachment.name}`}
                  hitSlop={HIT_SLOP}
                  onPress={() => onRemoveAttachment(attachment.id)}
                >
                  <Icon name="close" size={12} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.modes}>
          <ModeChip label="Think" icon="think" active={think} onPress={onToggleThink} />
          <ModeChip label="Search" icon="search" active={search} onPress={onToggleSearch} />
        </View>

        <View style={styles.inputRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach a file"
            hitSlop={HIT_SLOP}
            onPress={onAttach}
            style={styles.attach}
          >
            <Icon name="plus" size={18} color={colors.text} />
          </Pressable>

          <TextInput
            accessibilityLabel="Message"
            style={styles.input}
            value={value}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            onChangeText={onChangeText}
            onSubmitEditing={canSend ? onSend : undefined}
            submitBehavior="submit"
            multiline
            returnKeyType="send"
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={canSend ? "Send" : "Record"}
            hitSlop={HIT_SLOP}
            onPress={canSend ? onSend : onRecord}
            style={styles.record}
          >
            <Icon name={canSend ? "send" : "record"} size={18} color={colors.canvas} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

interface ModeChipProps {
  readonly label: string;
  readonly icon: "think" | "search";
  readonly active: boolean;
  readonly onPress: () => void;
}

function ModeChip({ label, icon, active, onPress }: ModeChipProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : undefined]}
    >
      <Icon name={icon} size={12} color={active ? colors.text : colors.textFaint} strokeWidth={2} />
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  composer: {
    borderRadius: radius.composer,
    backgroundColor: colors.composer,
    padding: space.sm,
    paddingBottom: 6,
    gap: space.xs,
  },
  modes: { flexDirection: "row", gap: 6, paddingHorizontal: 2, paddingBottom: 2 },
  attachments: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 2, paddingBottom: 4 },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  attachmentName: { maxWidth: 200, fontSize: typography.small, color: colors.textMuted },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  chipActive: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.26)",
  },
  chipLabel: { fontSize: 11.5, fontWeight: "500", color: colors.textFaint },
  chipLabelActive: { color: colors.text },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: 2 },
  attach: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.control,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minHeight: 34,
    maxHeight: 120,
    paddingTop: 7,
    paddingBottom: 7,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  record: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
});
