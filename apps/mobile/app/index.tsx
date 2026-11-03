import type { EmptyAction } from "@projectx/ui";
import { Composer, EmptyState, ModelPickerSheet, SessionHeader, colors } from "@projectx/ui";
import { useRouter } from "expo-router";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../src/navigation/useOpenDrawer";
import { listAvailableModels } from "../src/services/providerService";
import { useModelStore } from "../src/state/modelStore";

const EMPTY_ACTIONS: readonly EmptyAction[] = [
  { key: "project", label: "New project", icon: "folder" },
  { key: "slides", label: "Slides", icon: "slides" },
  { key: "attach", label: "Attach a doc", icon: "attach" },
];

const DEMO_SESSION_ID = "q4-roadmap";

export default function ChatsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();
  const router = useRouter();
  const models = useModelStore((state) => state.models);
  const currentModel = useModelStore((state) => state.current);
  const selectModel = useModelStore((state) => state.select);
  const setModels = useModelStore((state) => state.setModels);

  const [text, setText] = useState("");
  const [think, setThink] = useState(true);
  const [search, setSearch] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    void listAvailableModels().then(setModels);
  }, [setModels]);

  function send(): void {
    if (text.trim().length === 0) {
      return;
    }
    router.push({ pathname: "/session/[id]", params: { id: DEMO_SESSION_ID } });
  }

  function runEmptyAction(key: string): void {
    if (key === "project") {
      router.push("/projects");
      return;
    }
    setText(
      key === "slides"
        ? "Make a deck from the document I attach."
        : "Summarise the document I attach.",
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
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
        onChangeText={setText}
        onToggleThink={() => setThink((value) => !value)}
        onToggleSearch={() => setSearch((value) => !value)}
        onAttach={() => setText("Summarise the document I attach.")}
        onSend={send}
        onRecord={() => undefined}
      />

      <ModelPickerSheet
        visible={pickerOpen}
        models={models}
        selectedId={currentModel?.id ?? null}
        onSelect={(model, effort) => selectModel(model, effort)}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
});
