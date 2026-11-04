import type { AttachmentChip, EmptyAction } from "@projectx/ui";
import { Composer, EmptyState, ModelPickerSheet, SessionHeader, colors } from "@projectx/ui";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import type { ReactElement } from "react";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../src/navigation/useOpenDrawer";
import { createSession } from "../src/services/sessionQueries";
import { turnService } from "../src/services/turnService";
import { useModelCatalog } from "../src/state/useModelCatalog";
import { useSessionStore } from "../src/state/sessionStore";
import { useModelStore } from "../src/state/modelStore";

const EMPTY_ACTIONS: readonly EmptyAction[] = [
  { key: "project", label: "New project", icon: "folder" },
  { key: "slides", label: "Slides", icon: "slides" },
  { key: "attach", label: "Attach a doc", icon: "attach" },
];

export default function ChatsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();
  const router = useRouter();
  const models = useModelStore((state) => state.models);
  const currentModel = useModelStore((state) => state.current);
  const selectModel = useModelStore((state) => state.select);

  const [text, setText] = useState("");
  const [think, setThink] = useState(true);
  const [search, setSearch] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachments, setAttachments] = useState<readonly AttachmentChip[]>([]);
  const [error, setError] = useState<string | null>(null);

  useModelCatalog();
  async function send(): Promise<void> {
    const value = text.trim();
    const selection = currentModel;
    if (value.length === 0 || !selection) {
      if (!selection) {
        setError("Add a provider and choose a model first.");
      }
      return;
    }
    const separator = selection.id.indexOf(":");
    if (separator <= 0) {
      setError("That model selection is not usable. Pick it again.");
      return;
    }

    setError(null);
    try {
      const sessionId = await createSession({
        title: value.slice(0, 60),
        providerId: selection.id.slice(0, separator),
        modelId: selection.id.slice(separator + 1),
      });
      // Claim the store before navigating so the session screen renders the live turn
      // instead of re-reading an empty session from disk.
      useSessionStore.getState().beginSession(sessionId, value.slice(0, 60), []);
      setText("");
      router.push({ pathname: "/session/[id]", params: { id: sessionId } });
      void turnService.send({
        sessionId,
        selectionId: selection.id,
        effort: selection.effort,
        text: value,
        think,
      });
    } catch {
      setError("Could not start the chat.");
    }
  }

  async function attach(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) {
      return;
    }
    setAttachments((current) => [...current, { id: asset.uri, name: asset.name }]);
  }

  function runEmptyAction(key: string): void {
    if (key === "project") {
      router.push("/projects");
      return;
    }
    if (key === "attach") {
      void attach();
      return;
    }
    setText("Make a deck from the attached document.");
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.fill, { paddingTop: insets.top }]}>
      <SessionHeader
        model={currentModel?.label ?? "Select model"}
        effort={currentModel?.effort}
        onOpenDrawer={openDrawer}
        onOpenModelPicker={() => setPickerOpen(true)}
      />

      <EmptyState headline="What shall we think through?" actions={EMPTY_ACTIONS} onAction={runEmptyAction} />

      <Composer
        value={text}
        placeholder="Ask me. Task me."
        think={think}
        search={search}
        streaming={false}
        attachments={attachments}
        onRemoveAttachment={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
        onChangeText={setText}
        onToggleThink={() => setThink((value) => !value)}
        onToggleSearch={() => setSearch((value) => !value)}
        onAttach={() => {
          void attach();
        }}
        onSend={() => {
          void send();
        }}
        onStop={() => undefined}
        onRecord={() => undefined}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ModelPickerSheet
        visible={pickerOpen}
        models={models}
        selectedId={currentModel?.id ?? null}
        onSelect={(model, effort) => selectModel(model, effort)}
        onClose={() => setPickerOpen(false)}
      />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  fill: { flex: 1 },
  error: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
  },
});
