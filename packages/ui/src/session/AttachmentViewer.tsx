import type { ReactElement } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

export interface AttachmentPreview {
  readonly name: string;
  readonly mimeType: string;
  readonly kind: "image" | "document";
  readonly base64: string | null;
}

export interface AttachmentViewerProps {
  readonly attachment: AttachmentPreview | null;
  readonly onClose: () => void;
}

/** Full-screen preview for a sent image. Documents wait for the extraction/viewer slice. */
export function AttachmentViewer({
  attachment,
  onClose,
}: AttachmentViewerProps): ReactElement | null {
  if (!attachment) {
    return null;
  }
  const canPreview = attachment.kind === "image" && attachment.base64 !== null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close attachment preview"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={styles.panel}>
          <View style={styles.head}>
            <Text style={styles.name} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={HIT_SLOP}
              onPress={onClose}
            >
              <Icon name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          {canPreview ? (
            <Image
              accessibilityLabel={`Preview of ${attachment.name}`}
              source={{
                uri: `data:${attachment.mimeType};base64,${attachment.base64 ?? ""}`,
              }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.unsupported}>
              Preview is only available for images right now.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "center",
    padding: space.xl,
    backgroundColor: "rgba(0, 0, 0, 0.86)",
  },
  panel: {
    maxHeight: "88%",
    borderRadius: radius.sheet,
    backgroundColor: colors.raised,
    padding: space.md,
    gap: space.md,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  name: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.text,
  },
  image: {
    width: "100%",
    height: 420,
    borderRadius: radius.card,
    backgroundColor: colors.canvas,
  },
  unsupported: {
    paddingVertical: space.xl,
    fontSize: typography.label,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: "center",
  },
});
