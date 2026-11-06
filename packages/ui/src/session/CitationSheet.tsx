import type { ReactElement } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, HIT_SLOP, monoFont, radius, space, typography } from "../theme";
import type { CitationRef } from "../types";
import { citationLocation } from "./citations";

export interface CitationView {
  readonly citation: CitationRef;
  /** Extracted text for the cited page/section, or null while loading. */
  readonly text: string | null;
  readonly loading: boolean;
}

export interface CitationSheetProps {
  readonly view: CitationView | null;
  readonly onClose: () => void;
  readonly onOpenFile: (citation: CitationRef) => void;
}

/** Shows the cited page/section text, with the original file one tap away. */
export function CitationSheet({
  view,
  onClose,
  onOpenFile,
}: CitationSheetProps): ReactElement {
  const insets = useSafeAreaInsets();
  const location = view ? citationLocation(view.citation) : "";

  return (
    <Modal visible={view !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close citation"
        style={styles.scrim}
        onPress={onClose}
      >
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
            <Text style={styles.title} numberOfLines={1}>
              {view?.citation.fileName ?? ""}
            </Text>
            <View style={styles.headSpacer} />
          </View>

          {location ? <Text style={styles.location}>{location}</Text> : null}

          <ScrollView contentContainerStyle={styles.bodyContent}>
            {view?.loading ? (
              <Text style={styles.muted}>Loading page…</Text>
            ) : view?.text ? (
              <Text style={styles.bodyText}>{view.text}</Text>
            ) : (
              <Text style={styles.muted}>
                No extracted text is stored for this location.
              </Text>
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${view?.citation.fileName ?? "file"}`}
            onPress={() => {
              if (view) {
                onOpenFile(view.citation);
              }
            }}
            style={styles.openFile}
          >
            <Icon name="attach" size={15} color={colors.text} />
            <Text style={styles.openFileText}>Open file</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "72%",
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
    gap: space.md,
    marginBottom: space.xs,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  headSpacer: { width: 16 },
  location: {
    fontFamily: monoFont,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: space.md,
  },
  bodyContent: { paddingBottom: space.md },
  bodyText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  muted: {
    fontSize: typography.small,
    lineHeight: 18,
    color: colors.textMuted,
  },
  openFile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: space.md,
  },
  openFileText: { fontSize: 13, color: colors.text },
});
