import { Icon, colors, HIT_SLOP, radius, space, typography } from "@projectx/ui";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../navigation/useOpenDrawer";

export interface PlaceholderScreenProps {
  readonly title: string;
  readonly body: string;
}

/** Temporary surface for destinations whose content arrives in a later milestone. */
export function PlaceholderScreen({ title, body }: PlaceholderScreenProps): ReactElement {
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open navigation"
          hitSlop={HIT_SLOP}
          onPress={openDrawer}
          style={styles.iconButton}
        >
          <Icon name="menu" size={19} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.body}>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "600", color: colors.text },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xxl },
  bodyText: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
    textAlign: "center",
  },
});
