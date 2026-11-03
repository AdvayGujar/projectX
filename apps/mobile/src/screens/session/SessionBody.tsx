import type { ViewTurn } from "@projectx/ui";
import { Transcript, colors } from "@projectx/ui";
import type { ReactElement } from "react";
import { useRef } from "react";
import { ScrollView, StyleSheet, Text, type ScrollViewInstance } from "react-native";

export interface SessionBodyProps {
  readonly turns: readonly ViewTurn[];
  readonly error: string | null;
  readonly streaming: boolean;
  readonly onReadAloud: (turnId: string) => void;
  readonly onOpenSources: () => void;
}

/** Scrolling zone: transcript, empty state and the inline error. */
export function SessionBody({
  turns,
  error,
  streaming,
  onReadAloud,
  onOpenSources,
}: SessionBodyProps): ReactElement {
  const scrollRef = useRef<ScrollViewInstance>(null);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
    >
      {turns.length > 0 ? (
        <Transcript
          turns={turns}
          onCopy={() => undefined}
          onRegenerate={() => undefined}
          onReadAloud={onReadAloud}
          onOpenSources={onOpenSources}
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
