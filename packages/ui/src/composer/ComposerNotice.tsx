import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import type { IconName } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

export interface ComposerNoticeProps {
  readonly message: string | null;
  readonly icon?: IconName;
  readonly onDismiss: () => void;
}

/**
 * A notice that floats directly above the composer. Used for capability problems so the
 * message sits where the user is looking instead of becoming transcript text.
 */
export function ComposerNotice({
  message,
  icon = "attach",
  onDismiss,
}: ComposerNoticeProps): ReactElement | null {
  if (!message) {
    return null;
  }
  return (
    <View style={styles.wrap} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name={icon} size={15} color={colors.textMuted} />
      <Text style={styles.text}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss notice"
        hitSlop={HIT_SLOP}
        onPress={onDismiss}
      >
        <Icon name="close" size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.xs,
    paddingVertical: 9,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  },
  text: {
    flex: 1,
    fontSize: typography.small,
    lineHeight: 16,
    color: colors.text,
  },
});
