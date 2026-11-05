import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space } from "../theme";

export interface ProjectHeaderProps {
  readonly title: string;
  readonly onOpenDrawer: () => void;
  readonly onOpenMenu: () => void;
}

/** Hamburger · centred project name · overflow. Same three-slot grid as the session header. */
export function ProjectHeader({
  title,
  onOpenDrawer,
  onOpenMenu,
}: ProjectHeaderProps): ReactElement {
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

      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Project menu"
        hitSlop={HIT_SLOP}
        onPress={onOpenMenu}
        style={styles.iconButton}
      >
        <Icon name="more" size={19} color={colors.text} />
      </Pressable>
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
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
});
