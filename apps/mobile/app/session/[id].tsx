import type { AttachmentChip, SourceRef } from "@projectx/ui";
import {
  Composer,
  ModelPickerSheet,
  SessionHeader,
  SessionMenu,
  SourcesSheet,
  Transcript,
  colors,
} from "@projectx/ui";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../../src/navigation/useOpenDrawer";
import { loadSession } from "../../src/services/sessionQueries";
import { sendTurn } from "../../src/services/turnService";
import { useModelCatalog } from "../../src/state/useModelCatalog";
import { useModelStore } from "../../src/state/modelStore";
import { useSessionStore } from "../../src/state/sessionStore";

export default function SessionScreen(): ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const sessionId = params.id ?? "";
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();

  const models = useModelStore((state) => state.models);
  const currentModel = useModelStore((state) => state.current);
  const selectModel = useModelStore((state) => state.select);
  useModelCatalog();

  const turns = useSessionStore((state) => state.turns);
  const title = useSessionStore((state) => state.title);
  const streaming = useSessionStore((state) => state.streaming);
  const error = useSessionStore((state) => state.error);
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
          beginSession(sessionId, loaded.title, loaded.turns);
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
    setText("");
    void sendTurn({ sessionId, text: value });
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
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <SessionHeader
          model={currentModel?.label ?? "Select model"}
          effort={currentModel?.effort}
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
        {turns.length > 0 ? (
          <Transcript
            turns={turns}
            onCopy={() => undefined}
            onRegenerate={() => undefined}
            onReadAloud={readAloud}
            onOpenSources={() => setSourcesOpen(true)}
          />
        ) : (
          <Text style={styles.missing}>
            {error ?? (streaming ? "Thinking…" : "Send a message to start.")}
          </Text>
        )}
        {error && turns.length > 0 ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Composer
          value={text}
          placeholder="Reply or hold to talk"
          think={think}
          search={search}
          attachments={attachments}
          onRemoveAttachment={(id) =>
            setAttachments((current) => current.filter((item) => item.id !== id))
          }
          onChangeText={setText}
          onToggleThink={() => setThink((value) => !value)}
          onToggleSearch={() => setSearch((value) => !value)}
          onAttach={() => {
            void attach();
          }}
          onSend={send}
          onRecord={() => undefined}
        />
      </KeyboardAvoidingView>

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
  error: {
    marginTop: 12,
    paddingHorizontal: 18,
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
  },
});
