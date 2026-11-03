import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, HIT_SLOP, monoFont, space, typography } from "../theme";
import type { ToolActivity } from "../types";

export interface ThoughtProps {
  readonly summary: string;
  readonly reasoning: string;
  readonly activity: readonly ToolActivity[];
  readonly open: boolean;
  readonly onToggle: () => void;
}

/**
 * One disclosure per assistant turn. Reasoning, and what the turn read or wrote,
 * never appear as separate blocks in the transcript (UI_SPEC.md §3a).
 */
export function Thought({
  summary,
  reasoning,
  activity,
  open,
  onToggle,
}: ThoughtProps): ReactElement {
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityState={{ expanded: open }}
        hitSlop={HIT_SLOP}
        onPress={onToggle}
        style={styles.head}
      >
        <View style={open ? styles.chevronOpen : undefined}>
          <Icon name="chevron" size={12} color={colors.textFaint} strokeWidth={2.2} />
        </View>
        <Text style={styles.summary}>{summary}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text style={styles.reasoning}>{reasoning}</Text>
          {activity.map((item, index) => (
            <View key={`${item.kind}-${item.tool}-${index}`} style={styles.row}>
              <Text style={styles.io}>{item.kind}</Text>
              <Text style={styles.tool}>{item.tool}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: space.xl, marginBottom: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  summary: {
    fontSize: typography.small,
    color: colors.textFaint,
    lineHeight: 16,
  },
  panel: {
    marginTop: space.sm,
    marginLeft: space.xs,
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.control,
  },
  reasoning: {
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.textMuted,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
    paddingVertical: 1,
  },
  io: {
    fontFamily: monoFont,
    fontSize: typography.small,
    color: colors.textDisabled,
    minWidth: 34,
  },
  tool: {
    fontFamily: monoFont,
    fontSize: typography.small,
    fontWeight: "600",
    color: "#cfc7bb",
  },
  detail: {
    fontFamily: monoFont,
    fontSize: typography.small,
    color: "#9c9287",
    flexShrink: 1,
  },
});
