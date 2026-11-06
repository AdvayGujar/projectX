import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, monoFont, radius, space, typography } from "../theme";
import type { CitationRef } from "../types";
import type { CitedCitation } from "./citations";

export interface CitationChipsProps {
  readonly citations: readonly CitedCitation[];
  readonly onOpenCitation: (citation: CitationRef) => void;
}

/**
 * Tappable citations under the answer. Android does not reliably deliver taps to a Text
 * nested in another Text, so the chips sit beside the markdown rather than inside it.
 */
export function CitationChips({
  citations,
  onOpenCitation,
}: CitationChipsProps): ReactElement | null {
  if (citations.length === 0) {
    return null;
  }
  return (
    <View style={styles.root}>
      {citations.map(({ citation, label }, index) => (
        <Pressable
          key={`${label}-${citation.fileId}-${index}`}
          accessibilityRole="button"
          accessibilityLabel={`Open source ${label}`}
          hitSlop={8}
          onPress={() => onOpenCitation(citation)}
          style={styles.chip}
        >
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: space.sm,
  },
  chip: {
    backgroundColor: colors.control,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  label: {
    fontFamily: monoFont,
    fontSize: typography.small,
    color: "#cfc7bb",
  },
});
