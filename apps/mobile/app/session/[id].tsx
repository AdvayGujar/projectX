import type { ModelOption, SourceRef, ViewTurn } from "@projectx/ui";
import {
  Composer,
  ModelPickerSheet,
  SessionHeader,
  SessionMenu,
  SourcesSheet,
  Transcript,
  colors,
} from "@projectx/ui";
import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { findSession } from "../../src/fixtures/session";
import { useOpenDrawer } from "../../src/navigation/useOpenDrawer";
import { MODELS, useModelStore } from "../../src/state/modelStore";

export default function SessionScreen(): ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();
  const currentModel = useModelStore((state) => state.current);
  const selectModel = useModelStore((state) => state.select);

  const fixture = findSession(params.id ?? "");
  const turns: readonly ViewTurn[] = fixture?.turns ?? [];

  const [text, setText] = useState("");
  const [think, setThink] = useState(true);
  const [search, setSearch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const sources = useMemo<readonly SourceRef[]>(
    () => turns.flatMap((turn) => turn.sources ?? []),
    [turns],
  );

  function readAloud(turnId: string): void {
    if (muted) {
      return;
    }
    const turn = turns.find((item) => item.id === turnId);
    if (turn) {
      Speech.stop();
      Speech.speak(turn.text);
    }
  }

  function toggleMute(): void {
    setMuted((value) => {
      if (!value) {
        Speech.stop();
      }
      return !value;
    });
  }

  function chooseModel(id: string): void {
    const model: ModelOption | undefined = MODELS.find((option) => option.id === id);
    if (model) {
      selectModel(model);
    }
    setPickerOpen(false);
  }

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <SessionHeader
          model={currentModel.label}
          effort={currentModel.effort}
          onOpenDrawer={openDrawer}
          onOpenModelPicker={() => setPickerOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {fixture ? (
          <Transcript
            turns={turns}
            onCopy={() => undefined}
            onRegenerate={() => undefined}
            onReadAloud={readAloud}
            onOpenSources={() => setSourcesOpen(true)}
          />
        ) : (
          <Text style={styles.missing}>Chat not found.</Text>
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Composer
          value={text}
          placeholder="Reply or hold to talk"
          think={think}
          search={search}
          onChangeText={setText}
          onToggleThink={() => setThink((value) => !value)}
          onToggleSearch={() => setSearch((value) => !value)}
          onAttach={() => undefined}
          onSend={() => setText("")}
          onRecord={() => undefined}
        />
      </KeyboardAvoidingView>

      <SessionMenu
        visible={menuOpen}
        title={fixture?.title ?? "Untitled"}
        muted={muted}
        onClose={() => setMenuOpen(false)}
        onToggleMute={toggleMute}
        onRename={() => setMenuOpen(false)}
        onPin={() => setMenuOpen(false)}
        onAddToProject={() => setMenuOpen(false)}
        onDelete={() => setMenuOpen(false)}
      />

      <SourcesSheet visible={sourcesOpen} sources={sources} onClose={() => setSourcesOpen(false)} />

      <ModelPickerSheet
        visible={pickerOpen}
        models={MODELS}
        selectedId={currentModel.id}
        onSelect={chooseModel}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 8 },
  missing: {
    marginTop: 48,
    textAlign: "center",
    fontSize: 13,
    color: colors.textMuted,
  },
});
