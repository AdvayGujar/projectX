import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Icon } from "../icons";
import type { IconName } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

const ICON_CHOICES = ["folder", "layers", "bubble", "pin", "slides", "image"] as const;

export interface ProjectFieldsProps {
  readonly name: string;
  readonly icon: IconName;
  readonly instructions: string;
  readonly mode: "create" | "edit";
  readonly onChangeName: (value: string) => void;
  readonly onChangeIcon: (icon: IconName) => void;
  readonly onChangeInstructions: (value: string) => void;
}

/** Name, icon, and instructions. Kept out of the sheet so its render body stays small. */
export function ProjectFields({
  name,
  icon,
  instructions,
  mode,
  onChangeName,
  onChangeIcon,
  onChangeInstructions,
}: ProjectFieldsProps): ReactElement {
  return (
    <>
      <Text style={styles.sectionLabel}>Name</Text>
      <TextInput
        accessibilityLabel="Project name"
        style={styles.input}
        value={name}
        onChangeText={onChangeName}
        placeholder="e.g. Q4 research"
        placeholderTextColor={colors.textFaint}
        autoFocus={mode === "create"}
        returnKeyType="done"
      />

      <Text style={styles.sectionLabel}>Icon</Text>
      <View style={styles.iconRow}>
        {ICON_CHOICES.map((choice) => {
          const active = choice === icon;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`Icon ${choice}`}
              accessibilityState={{ selected: active }}
              onPress={() => onChangeIcon(choice)}
              hitSlop={HIT_SLOP}
              style={[styles.iconChoice, active ? styles.iconChoiceActive : undefined]}
            >
              <Icon name={choice} size={18} color={active ? colors.text : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Instructions</Text>
      <TextInput
        accessibilityLabel="Project instructions"
        style={[styles.input, styles.instructions]}
        value={instructions}
        onChangeText={onChangeInstructions}
        placeholder="Tone, format, or what this project is for"
        placeholderTextColor={colors.textFaint}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.hint}>
        Stored with the project. Chats in this project read it in a later milestone.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: space.md,
    marginBottom: space.sm,
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.textFaint,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.card,
    backgroundColor: colors.canvas,
    paddingVertical: 11,
    paddingHorizontal: space.md,
    fontSize: typography.label,
    color: colors.text,
  },
  instructions: { minHeight: 96 },
  hint: {
    marginTop: space.sm,
    fontSize: typography.small,
    lineHeight: 16,
    color: colors.textFaint,
  },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  iconChoice: {
    width: 38,
    height: 38,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconChoiceActive: {
    borderColor: colors.text,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
