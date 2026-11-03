import type { ReactElement } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import type { SourceRef } from "../types";

export interface SourcesSheetProps {
  readonly visible: boolean;
  readonly sources: readonly SourceRef[];
  readonly onClose: () => void;
}

/** Bottom sheet per UI_SPEC.md §8. Monograms, never remote favicons. */
export function SourcesSheet({ visible, sources, onClose }: SourcesSheetProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close sources" style={styles.scrim} onPress={onClose}>
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
            <Text style={styles.title}>Sources</Text>
            <View style={styles.headSpacer} />
          </View>

          <ScrollView>
            {sources.map((source, index) => (
              <View key={`${source.domain}-${index}`} style={styles.row}>
                <Text style={styles.sourceTitle}>{source.title}</Text>
                <View style={styles.domainRow}>
                  <View style={styles.monogram}>
                    <Text style={styles.monogramLetter}>
                      {source.domain.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.domain}>{source.domain}</Text>
                </View>
              </View>
            ))}
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  sourceTitle: { fontSize: 13, color: colors.text },
  domainRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  monogram: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.control,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramLetter: { fontSize: 8, fontWeight: "700", color: colors.textMuted },
  domain: { fontSize: typography.small, color: colors.textMuted },
});
