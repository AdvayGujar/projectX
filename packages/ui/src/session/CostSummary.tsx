import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";

import { colors, space, typography } from "../theme";

export interface SessionUsageSummary {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number | null;
  readonly costComplete: boolean;
}

/**
 * Accumulated usage for the open session. USD is shown only when every turn had a known
 * price; a partial sum would understate the spend.
 */
export function CostSummary({ usage }: { readonly usage: SessionUsageSummary }): ReactElement | null {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) {
    return null;
  }
  const parts = [
    "Session",
    `${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`,
  ];
  if (usage.costComplete && usage.costUsd !== null) {
    parts.push(`$${usage.costUsd.toFixed(4)}`);
  }
  return <Text style={styles.text}>{parts.join(" · ")}</Text>;
}

const styles = StyleSheet.create({
  text: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
    fontSize: typography.small,
    color: colors.textDisabled,
  },
});
