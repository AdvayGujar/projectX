import type { AttachmentChip, CitationRef, CitationView, IconName, SourceRef } from "@projectx/ui";
import {
  AttachmentViewer,
  CitationSheet,
  ComposerNotice,
  ModelPickerSheet,
  SourcesSheet,
  colors,
} from "@projectx/ui";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

import { useOpenDrawer } from "../../src/navigation/useOpenDrawer";
import { SessionActions } from "../../src/screens/session/SessionActions";
import { SessionBody } from "../../src/screens/session/SessionBody";
import { attachmentProblem, readImageAttachments } from "../../src/services/attachments";
import { planAttachmentOpen } from "../../src/services/attachmentOpen";
import { loadCitationSource } from "../../src/services/citationSource";
import { ingestFile } from "../../src/services/documentIngest";
import { describeError } from "../../src/services/errorMessage";
import { openFileById } from "../../src/services/filePreview";
import { SessionComposerSection } from "../../src/screens/session/SessionComposerSection";
import { SessionTopBar } from "../../src/screens/session/SessionTopBar";
import {
  loadSession,
  prepareRegeneration,
  type LoadedAttachment,
} from "../../src/services/sessionQueries";
import { turnService } from "../../src/services/turnService";
import { useModelCatalog } from "../../src/state/useModelCatalog";
import { useModelStore } from "../../src/state/modelStore";
import { useSessionStore } from "../../src/state/sessionStore";

export default function SessionScreen(): ReactElement {
  const params = useLocalSearchParams<{ id: string; focus?: string }>();
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
  const setTitle = useSessionStore((state) => state.setTitle);
  const setError = useSessionStore((state) => state.setError);

  const [text, setText] = useState("");
  const [think, setThink] = useState(true);
  const [search, setSearch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachments, setAttachments] = useState<readonly AttachmentChip[]>([]);
  const [notice, setNotice] = useState<{ message: string; icon: IconName } | null>(null);
  const [viewer, setViewer] = useState<LoadedAttachment | null>(null);
  const [citationView, setCitationView] = useState<CitationView | null>(null);

  useEffect(() => {
    if (sessionId.length === 0 || activeSessionId === sessionId) {
      return;
    }
    let active = true;
    setPinned(false);
    setProjectId(null);
    void loadSession(sessionId)
      .then((loaded) => {
        if (!active) {
          return;
        }
        if (loaded) {
          setPinned(loaded.pinned);
          setProjectId(loaded.projectId);
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

  async function send(): Promise<void> {
    const value = text.trim();
    if (value.length === 0 || streaming) {
      return;
    }
    if (!currentModel) {
      setError("Choose a model before sending.");
      return;
    }
    const problem = attachmentProblem(attachments, currentModel, {
      documentsAllowed: true,
    });
    if (problem) {
      setNotice({ message: problem, icon: "image" });
      return;
    }
    let images;
    try {
      images = await readImageAttachments(attachments);
    } catch {
      setNotice({ message: "Could not read the attached image. Try attaching it again.", icon: "image" });
      return;
    }
    const documents = attachments
      .filter((attachment) => attachment.kind === "document")
      .map((attachment) => ({
        fileId: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
      }));
    setError(null);
    setNotice(null);
    setText("");
    setAttachments([]);
    void turnService.send({
      sessionId,
      selectionId: currentModel.id,
      effort: currentModel.effort,
      text: value,
      think,
      images,
      documents,
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
    const mimeType = asset.mimeType ?? "application/octet-stream";
    if (mimeType.startsWith("image/")) {
      addPickerAttachment(asset.uri, asset.name, mimeType, asset.size ?? null);
      return;
    }
    const place = projectId === null ? "this chat" : "the project library";
    setNotice({ message: "Reading document…", icon: "attach" });
    try {
      const imported = await ingestFile({
        sessionId,
        sourceUri: asset.uri,
        name: asset.name,
        mime: mimeType,
        size: asset.size ?? null,
      });
      if (imported.document.status === "error") {
        setNotice({
          message: `${imported.file.name} joined ${place}, but its text could not be read.`,
          icon: "attach",
        });
        return;
      }
      if (imported.document.status !== "ready") {
        setNotice({
          message: `${imported.file.name} joined ${place}. This format cannot be read yet.`,
          icon: "attach",
        });
        return;
      }
      setNotice(null);
      setAttachments((current) => [
        ...current,
        {
          id: imported.file.id,
          name: imported.file.name,
          mimeType: imported.file.mime,
          kind: "document",
          size: imported.file.size,
        },
      ]);
    } catch {
      setNotice({ message: `Could not add that document to ${place}.`, icon: "attach" });
    }
  }

  function addPickerAttachment(
    id: string,
    name: string,
    mimeType: string,
    size: number | null,
  ): void {
    setNotice(null);
    setAttachments((current) => [
      ...current,
      { id, name, mimeType, kind: "image", size },
    ]);
  }

  async function regenerate(turnId: string): Promise<void> {
    if (streaming) {
      return;
    }
    try {
      const target = await prepareRegeneration(sessionId, turnId);
      if (!target) {
        setError("Only the latest reply can be regenerated.");
        return;
      }
      const loaded = await loadSession(sessionId);
      if (!loaded) {
        setError("Could not reload this chat.");
        return;
      }
      beginSession(sessionId, loaded.title, loaded.turns, loaded.totals);
      setError(null);
      void turnService.send({
        sessionId,
        selectionId: target.selectionId,
        effort: target.effort,
        text: target.text,
        think,
        regenerate: true,
      });
    } catch {
      setError("Could not regenerate this reply.");
    }
  }

  async function openAttachment(turnId: string, index: number): Promise<void> {
    try {
      const target = await planAttachmentOpen(turnId, index);
      if (target.kind === "viewer") {
        setViewer(target.attachment);
      } else if (target.kind === "document") {
        await openFileById(target.fileId);
      } else {
        setNotice({ message: target.message, icon: "attach" });
      }
    } catch (failure) {
      setNotice({
        message: describeError(failure, "Could not open the attachment."),
        icon: "attach",
      });
    }
  }

  async function openCitation(citation: CitationRef): Promise<void> {
    setCitationView({ citation, text: null, loading: true });
    try {
      const source = await loadCitationSource(citation);
      setCitationView({ citation: source.citation, text: source.text, loading: false });
    } catch {
      setCitationView(null);
      setNotice({ message: "Could not open that citation.", icon: "attach" });
    }
  }

  async function openCitationFile(citation: CitationRef): Promise<void> {
    try {
      await openFileById(citation.fileId);
    } catch (failure) {
      setNotice({
        message: describeError(failure, "Could not open the cited file."),
        icon: "attach",
      });
    }
  }

  async function copyTurn(turnId: string): Promise<void> {
    const turn = turns.find((item) => item.id === turnId);
    if (!turn || turn.text.length === 0) {
      return;
    }
    try {
      await Clipboard.setStringAsync(turn.text);
      setNotice({ message: "Copied to clipboard.", icon: "copy" });
    } catch {
      setNotice({ message: "Could not copy this reply.", icon: "copy" });
    }
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
        focusTurnId={params.focus ?? null}
        onCopy={(turnId) => {
          void copyTurn(turnId);
        }}
        onRegenerate={(turnId) => {
          void regenerate(turnId);
        }}
        onOpenAttachment={(turnId, attachment) => {
          void openAttachment(turnId, attachment.index);
        }}
        onOpenCitation={(citation) => {
          void openCitation(citation);
        }}
        onReadAloud={readAloud}
        onOpenSources={() => setSourcesOpen(true)}
      />

      <ComposerNotice
        message={notice?.message ?? null}
        icon={notice?.icon}
        onDismiss={() => setNotice(null)}
      />

      <SessionComposerSection
        text={text}
        think={think}
        search={search}
        streaming={streaming}
        attachments={attachments}
        usage={usage}
        onChangeText={setText}
        onToggleThink={() => setThink((value) => !value)}
        onToggleSearch={() => setSearch((value) => !value)}
        onAttach={() => {
          void attach();
        }}
        onRemoveAttachment={(id) => {
          setNotice(null);
          setAttachments((current) => current.filter((item) => item.id !== id));
        }}
        onSend={() => {
          void send();
        }}
        onStop={() => turnService.stop()}
        onRecord={() => undefined}
      />

      <SessionActions
        sessionId={sessionId}
        title={title}
        muted={muted}
        pinned={pinned}
        projectId={projectId}
        menuOpen={menuOpen}
        onCloseMenu={() => setMenuOpen(false)}
        onToggleMute={toggleMute}
        onTitleChange={setTitle}
        onPinnedChange={setPinned}
        onProjectChange={setProjectId}
        onNotice={(message) => setNotice({ message, icon: "pencil" })}
      />

      <SourcesSheet visible={sourcesOpen} sources={sources} onClose={() => setSourcesOpen(false)} />

      <CitationSheet
        view={citationView}
        onClose={() => setCitationView(null)}
        onOpenFile={(citation) => {
          void openCitationFile(citation);
        }}
      />

      <AttachmentViewer attachment={viewer} onClose={() => setViewer(null)} />

      <ModelPickerSheet
        visible={pickerOpen}
        models={models}
        selectedId={currentModel?.id ?? null}
        onSelect={(model, effort) => {
          setNotice(null);
          selectModel(model, effort);
        }}
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
