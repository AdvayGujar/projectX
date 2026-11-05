import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import type { IconName } from "../icons";
import { useKeyboardVisible } from "../primitives/useKeyboardVisible";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import { ProjectFields } from "./ProjectFields";
import { projectIconName } from "./ProjectList";

export interface ProjectEditorInitial {
  readonly name: string;
  readonly icon: string | null;
  readonly instructions: string;
}

export interface ProjectEditorValues {
  readonly name: string;
  readonly icon: IconName;
  readonly instructions: string;
}

export interface ProjectEditorSheetProps {
  readonly visible: boolean;
  readonly mode: "create" | "edit";
  readonly initial: ProjectEditorInitial;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (values: ProjectEditorValues) => void;
  readonly onClose: () => void;
}

/** One sheet for both create and edit; `mode` only changes the title and the save label. */
export function ProjectEditorSheet({
  visible,
  mode,
  initial,
  busy,
  error,
  onSubmit,
  onClose,
}: ProjectEditorSheetProps): ReactElement {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { name, icon, instructions, setName, setIcon, setInstructions } = useEditorForm(
    visible,
    initial,
  );
  const canSave = name.trim().length > 0 && !busy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.scrim}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: keyboardVisible ? space.lg : insets.bottom + space.xl },
            ]}
          >
            <View style={styles.head}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={HIT_SLOP}
                onPress={onClose}
              >
                <Icon name="close" size={16} color={colors.text} />
              </Pressable>
              <Text style={styles.title}>{mode === "create" ? "New project" : "Edit project"}</Text>
              <View style={styles.headSpacer} />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <ProjectFields
                name={name}
                icon={icon}
                instructions={instructions}
                mode={mode}
                onChangeName={setName}
                onChangeIcon={setIcon}
                onChangeInstructions={setInstructions}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <SheetActions
                mode={mode}
                busy={busy}
                canSave={canSave}
                onCancel={onClose}
                onSave={() =>
                  onSubmit({ name: name.trim(), icon, instructions: instructions.trim() })
                }
              />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Opening loads the caller's values; typing must not be reset by a caller re-render. */
function useEditorForm(visible: boolean, initial: ProjectEditorInitial) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState<IconName>(projectIconName(initial.icon));
  const [instructions, setInstructions] = useState(initial.instructions);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(initial.name);
    setIcon(projectIconName(initial.icon));
    setInstructions(initial.instructions);
  }, [visible, initial.name, initial.icon, initial.instructions]);

  return { name, icon, instructions, setName, setIcon, setInstructions };
}

interface SheetActionsProps {
  readonly mode: "create" | "edit";
  readonly busy: boolean;
  readonly canSave: boolean;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}

function SheetActions({
  mode,
  busy,
  canSave,
  onCancel,
  onSave,
}: SheetActionsProps): ReactElement {
  return (
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelLabel}>Cancel</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === "create" ? "Create project" : "Save project"}
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={onSave}
        style={[styles.save, canSave ? undefined : styles.saveDisabled]}
      >
        <Text style={styles.saveLabel}>
          {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "82%",
    backgroundColor: colors.raised,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { fontSize: 13, fontWeight: "600", color: colors.text },
  headSpacer: { width: 16 },
  error: {
    marginTop: space.md,
    fontSize: typography.label,
    lineHeight: 18,
    color: colors.danger,
  },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  cancel: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: colors.composer,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelLabel: { fontSize: typography.body, color: colors.text },
  save: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: colors.text,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveDisabled: { opacity: 0.4 },
  saveLabel: { fontSize: typography.body, fontWeight: "600", color: colors.canvas },
});
