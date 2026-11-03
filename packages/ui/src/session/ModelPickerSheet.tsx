import type { ReactElement } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

export interface ModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly effort: string;
}

export interface ModelPickerSheetProps {
  readonly visible: boolean;
  readonly models: readonly ModelOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
}

/**
 * The only place a provider or model changes (D11). Capability warnings for attachments
 * arrive with the composer's capability check, not here.
 */
export function ModelPickerSheet({
  visible,
  models,
  selectedId,
  onSelect,
  onClose,
}: ModelPickerSheetProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close model picker" style={styles.scrim} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.head}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={HIT_SLOP} onPress={onClose}>
              <Icon name="close" size={16} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>Model</Text>
            <View style={styles.headSpacer} />
          </View>

          <ScrollView>
            {models.map((model) => {
              const selected = model.id === selectedId;
              return (
                <Pressable
                  key={model.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(model.id)}
                  style={styles.row}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{model.label}</Text>
                    <Text style={styles.meta}>
                      {model.provider} · {model.effort}
                    </Text>
                  </View>
                  {selected ? <Icon name="chevron" size={14} color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "62%",
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
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: typography.body, color: colors.text },
  meta: { fontSize: typography.small, color: colors.textMuted },
});
