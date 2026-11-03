import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

export interface SessionHeaderProps {
  readonly model: string;
  readonly effort?: string;
  readonly onOpenDrawer: () => void;
  readonly onOpenModelPicker: () => void;
  readonly onOpenMenu?: () => void;
}

/**
 * Exactly three affordances: hamburger, centred model pill, overflow.
 * No title, no pencil, no mute (D14, UI_SPEC.md §2).
 */
export function SessionHeader({
  model,
  effort,
  onOpenDrawer,
  onOpenMenu,
  onOpenModelPicker,
}: SessionHeaderProps): ReactElement {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open navigation"
        hitSlop={HIT_SLOP}
        onPress={onOpenDrawer}
        style={styles.iconButton}
      >
        <Icon name="menu" size={19} color={colors.text} />
      </Pressable>

      <View style={styles.center}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Model: ${model}, effort ${effort}`}
          hitSlop={HIT_SLOP}
          onPress={onOpenModelPicker}
          style={styles.pill}
        >
          <Text style={styles.model}>{model}</Text>
          {effort ? <Text style={styles.effort}>· {effort}</Text> : null}
        </Pressable>
      </View>

      {onOpenMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Session menu"
          hitSlop={HIT_SLOP}
          onPress={onOpenMenu}
          style={styles.iconButton}
        >
          <Icon name="more" size={19} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    gap: 6,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  model: {
    fontSize: typography.label,
    fontWeight: "600",
    color: colors.text,
  },
  effort: {
    fontSize: typography.label,
    fontWeight: "500",
    color: colors.text,
    opacity: 0.55,
  },
});
