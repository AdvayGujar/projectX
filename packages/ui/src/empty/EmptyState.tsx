import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Icon } from "../icons";
import { colors, radius, space, typography } from "../theme";
import type { IconName } from "../icons";

export interface EmptyAction {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
}

export interface EmptyStateProps {
  readonly headline: string;
  readonly actions: readonly EmptyAction[];
  readonly onAction: (key: string) => void;
}

/** Brand mark, one line, task chips (UI_SPEC.md §5). */
export function EmptyState({ headline, actions, onAction }: EmptyStateProps): ReactElement {
  return (
    <View style={styles.root}>
      <Svg width={44} height={44} viewBox="0 0 44 44" fill="none" stroke={colors.text}>
        <Path d="M22 6v32M6 22h32M10.7 10.7l22.6 22.6M33.3 10.7L10.7 33.3" strokeWidth={3} strokeLinecap="round" />
      </Svg>

      <Text style={styles.headline}>{headline}</Text>

      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            onPress={() => onAction(action.key)}
            style={styles.chip}
          >
            <Icon name={action.icon} size={14} color={colors.textMuted} />
            <Text style={styles.chipLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    gap: 6,
  },
  headline: {
    marginTop: space.md,
    fontSize: typography.headline,
    fontWeight: "500",
    letterSpacing: -0.2,
    color: colors.text,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.sm,
    marginTop: space.xl,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  chipLabel: { fontSize: typography.label, color: colors.text, opacity: 0.85 },
});
