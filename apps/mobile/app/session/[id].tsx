import type { AttachmentChip, SourceRef } from "@projectx/ui";
import { ModelPickerSheet, SessionMenu, SourcesSheet, colors } from "@projectx/ui";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

import { useOpenDrawer } from "../../src/navigation/useOpenDrawer";
import { SessionBody } from "../../src/screens/session/SessionBody";
import { SessionComposerSection } from "../../src/screens/session/SessionComposerSection";
import { SessionTopBar } from "../../src/screens/session/SessionTopBar";
import { loadSession } from "../../src/services/sessionQueries";
import { turnService } from "../../src/services/turnService";
import { useModelCatalog } from "../../src/state/useModelCatalog";
import { useModelStore } from "../../src/state/modelStore";
import { useSessionStore } from "../../src/state/sessionStore";

export default function SessionScreen(): ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const sessionId = params.id ?? "";
  const openDrawer = useOpenDrawer();

  const models = useModelStore((state) => state.models);
  const currentModel = useModelStore((state) => state.current);
  const selectModel = useModelStore((state) => state.select);
  useModelCatalog();

  const turns = useSessionStore((state) => state.turns);
  const title = useSessionStore((state) => state.title);
  const streaming = useSessionStore((state) => state.streaming);
  const error = useSessionStore((state) => state.error);
  const usage = useSessionStore((state) => state.usage);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const beginSession = useSessionStore((state) => state.beginSession);
  const setError = useSessionStore((state) => state.setError);

  const [text, setText] = useState("");
  const [think, setThink] = useState(true);
  const [search, setSearch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachments, setAttachments] = useState<readonly AttachmentChip[]>([]);

  useEffect(() => {
    if (sessionId.length === 0 || activeSessionId === sessionId) {
      return;
    }
    let active = true;
    void loadSession(sessionId)
      .then((loaded) => {
        if (!active) {
          return;
        }
        if (loaded) {
          beginSession(sessionId, loaded.title, loaded.turns, loaded.totals);
        } else {
          setError("Chat not found.");
        }
      })
      .catch(() => setError("Could not open this chat."));
    return () => {
      active = false;
    };
  }, [sessionId, activeSessionId, beginSession, setError]);

  const sources = useMemo<readonly SourceRef[]>(
    () => turns.flatMap((turn) => turn.sources ?? []),
    [turns],
  );

  function send(): void {
    const value = text.trim();
    if (value.length === 0 || streaming) {
      return;
    }
    if (!currentModel) {
      setError("Choose a model before sending.");
      return;
    }
    setText("");
    void turnService.send({
      sessionId,
      selectionId: currentModel.id,
      effort: currentModel.effort,
      text: value,
      think,
    });
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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.fill}>
        <SessionTopBar
        modelLabel={currentModel?.label ?? "Select model"}
        effort={currentModel?.effort}
        onOpenDrawer={openDrawer}
        onOpenModelPicker={() => setPickerOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
      />

      <SessionBody
        turns={turns}
        error={error}
        streaming={streaming}
        onReadAloud={readAloud}
        onOpenSources={() => setSourcesOpen(true)}
      />

      <SessionComposerSection
        text={text}
        think={think}
        search={search}
        attachments={attachments}
        usage={usage}
        onChangeText={setText}
        onToggleThink={() => setThink((value) => !value)}
        onToggleSearch={() => setSearch((value) => !value)}
        onAttach={() => {
          void attach();
        }}
        onRemoveAttachment={(id) =>
          setAttachments((current) => current.filter((item) => item.id !== id))
        }
        onSend={send}
        onRecord={() => undefined}
      />

      <SessionMenu
        visible={menuOpen}
        title={title || "Untitled"}
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
});
