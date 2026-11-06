import type { TurnAttachment, ViewTurn } from "@projectx/ui";
import { Transcript, colors } from "@projectx/ui";
import type { ReactElement } from "react";
import { useRef } from "react";
import { ScrollView, StyleSheet, Text, type ScrollViewInstance } from "react-native";

export interface SessionBodyProps {
  readonly turns: readonly ViewTurn[];
  readonly error: string | null;
  readonly streaming: boolean;
  /** Message id from a drawer search result; scrolled into view once. */
  readonly focusTurnId?: string | null;
  readonly onCopy: (turnId: string) => void;
  readonly onRegenerate: (turnId: string) => void;
  readonly onOpenAttachment: (turnId: string, attachment: TurnAttachment) => void;
  readonly onReadAloud: (turnId: string) => void;
  readonly onOpenSources: () => void;
}

const FOCUS_TOP_OFFSET = 16;

/** Scrolling zone: transcript, empty state and the inline error. */
export function SessionBody({
  turns,
  error,
  streaming,
  focusTurnId = null,
  onCopy,
  onRegenerate,
  onOpenAttachment,
  onReadAloud,
  onOpenSources,
}: SessionBodyProps): ReactElement {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsets = useRef(new Map<string, number>());
  const focusedTurnId = useRef<string | null>(null);
  const contentSized = useRef(false);

  const activeFocusId =
    focusTurnId !== null && turns.some((turn) => turn.id === focusTurnId)
      ? focusTurnId
      : null;

  function scrollToFocus(): void {
    if (!activeFocusId || focusedTurnId.current === activeFocusId) {
      return;
    }
    const offset = offsets.current.get(activeFocusId);
    if (offset === undefined) {
      return;
    }
    if (contentSized.current) {
      focusedTurnId.current = activeFocusId;
    }
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - FOCUS_TOP_OFFSET),
      animated: false,
    });
  }

  function handleTurnLayout(turnId: string, y: number): void {
    offsets.current.set(turnId, y);
    scrollToFocus();
  }

  function handleContentSizeChange(): void {
    contentSized.current = true;
    if (activeFocusId && focusedTurnId.current !== activeFocusId) {
      scrollToFocus();
      return;
    }
    scrollRef.current?.scrollToEnd({ animated: true });
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={handleContentSizeChange}
    >
      {turns.length > 0 ? (
        <Transcript
          turns={turns}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          onOpenAttachment={onOpenAttachment}
          onReadAloud={onReadAloud}
          onOpenSources={onOpenSources}
          onTurnLayout={handleTurnLayout}
        />
      ) : (
        <Text style={styles.placeholder}>
          {error ?? (streaming ? "Thinking…" : "Send a message to start.")}
        </Text>
      )}
      {error && turns.length > 0 ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 8 },
  placeholder: {
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
