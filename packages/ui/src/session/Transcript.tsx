import type { ReactElement } from "react";
import { useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import type { SourceRef, TurnAttachment, ViewTurn } from "../types";
import { Markdown } from "../markdown/Markdown";
import { costLine, streamingLabel, summarise } from "./format";
import { Thought } from "./Thought";

export interface TranscriptProps {
  readonly turns: readonly ViewTurn[];
  readonly onCopy: (turnId: string) => void;
  readonly onRegenerate: (turnId: string) => void;
  readonly onOpenAttachment: (turnId: string, attachment: TurnAttachment) => void;
  readonly onReadAloud: (turnId: string) => void;
  readonly onOpenSources: (turnId: string) => void;
  /** Reports each row's offset so a search result can scroll the transcript to it. */
  readonly onTurnLayout?: (turnId: string, y: number) => void;
}

const DISCLAIMER = "AI can make mistakes. Check generated files before sharing.";

export function Transcript({
  turns,
  onCopy,
  onRegenerate,
  onOpenAttachment,
  onReadAloud,
  onOpenSources,
  onTurnLayout,
}: TranscriptProps): ReactElement {
  const [openThoughtId, setOpenThoughtId] = useState<string | null>(null);

  function layoutHandler(turnId: string): ((event: LayoutChangeEvent) => void) | undefined {
    if (!onTurnLayout) {
      return undefined;
    }
    return (event) => onTurnLayout(turnId, event.nativeEvent.layout.y);
  }

  return (
    <View style={styles.root}>
      {turns.map((turn) =>
        turn.role === "user" ? (
          <View key={turn.id} style={styles.userRow} onLayout={layoutHandler(turn.id)}>
            {turn.text.length > 0 ? <Text style={styles.userText}>{turn.text}</Text> : null}
            {turn.attachments && turn.attachments.length > 0 ? (
              <View style={styles.userAttachments}>
                {turn.attachments.map((attachment) => (
                  <Pressable
                    key={`${attachment.name}-${attachment.index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${attachment.name}`}
                    hitSlop={HIT_SLOP}
                    onPress={() => onOpenAttachment(turn.id, attachment)}
                    style={styles.userAttachment}
                  >
                    <Icon
                      name={attachment.kind === "image" ? "image" : "attach"}
                      size={12}
                      color={colors.textMuted}
                    />
                    <Text style={styles.userAttachmentName} numberOfLines={1}>
                      {attachment.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View key={turn.id} style={styles.assistantRow} onLayout={layoutHandler(turn.id)}>
            {(turn.reasoningRequested !== false && Boolean(turn.reasoning)) ||
            (turn.activity?.length ?? 0) > 0 ? (
              <Thought
                summary={summarise(turn)}
                reasoning={turn.reasoning ?? ""}
                activity={turn.activity ?? []}
                open={openThoughtId === turn.id}
                onToggle={() =>
                  setOpenThoughtId((current) => (current === turn.id ? null : turn.id))
                }
              />
            ) : null}

            {turn.status === "streaming" && turn.text.length === 0 && !turn.reasoning ? (
              <Text style={styles.thinking}>{streamingLabel(turn.reasoningRequested)}</Text>
            ) : null}

            {turn.text.length > 0 ? <Markdown text={turn.text} /> : null}

            {turn.status === "streaming" ? null : (
              <Actions
                turn={turn}
                onCopy={onCopy}
                onRegenerate={onRegenerate}
                onReadAloud={onReadAloud}
                onOpenSources={onOpenSources}
              />
            )}
          </View>
        ),
      )}
    </View>
  );
}

interface ActionsProps {
  readonly turn: ViewTurn;
  readonly onCopy: (turnId: string) => void;
  readonly onRegenerate: (turnId: string) => void;
  readonly onReadAloud: (turnId: string) => void;
  readonly onOpenSources: (turnId: string) => void;
}

function Actions({ turn, onCopy, onRegenerate, onReadAloud, onOpenSources }: ActionsProps): ReactElement {
  return (
    <>
            {turn.artifact ? (
              <View style={styles.artifact}>
                <View style={styles.thumbnail} />
                <View style={styles.artifactText}>
                  <Text style={styles.artifactTitle}>{turn.artifact.title}</Text>
                  <Text style={styles.artifactSubtitle}>{turn.artifact.subtitle}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy"
                hitSlop={HIT_SLOP}
                onPress={() => onCopy(turn.id)}
              >
                <Icon name="copy" size={16} color={colors.textFaint} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Regenerate"
                hitSlop={HIT_SLOP}
                onPress={() => onRegenerate(turn.id)}
              >
                <Icon name="regen" size={16} color={colors.textFaint} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read aloud"
                hitSlop={HIT_SLOP}
                onPress={() => onReadAloud(turn.id)}
              >
                <Icon name="play" size={16} color={colors.textFaint} />
              </Pressable>

              {turn.sources && turn.sources.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${turn.sources.length} sources`}
                  hitSlop={HIT_SLOP}
                  onPress={() => onOpenSources(turn.id)}
                  style={styles.sources}
                >
                  <SourceDots sources={turn.sources} />
                  <Text style={styles.sourcesLabel}>{turn.sources.length} sources</Text>
                </Pressable>
              ) : null}
            </View>

            {turn.cost ? <Text style={styles.cost}>{costLine(turn.cost)}</Text> : null}

            <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
    </>
  );
}

function SourceDots({ sources }: { readonly sources: readonly SourceRef[] }): ReactElement {
  return (
    <View style={styles.dotStack}>
      {sources.slice(0, 3).map((source, index) => (
        <View
          key={`${source.domain}-${index}`}
          style={[
            styles.dot,
            { backgroundColor: monogramColour(source.domain) },
            index > 0 ? styles.dotOverlap : undefined,
          ]}
        >
          <Text style={styles.dotLetter}>{source.domain.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

function monogramColour(domain: string): string {
  const index = domain.charCodeAt(0) % colors.monograms.length;
  return colors.monograms[index] ?? colors.monograms[0];
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  userRow: {
    alignSelf: "flex-end",
    maxWidth: "82%",
    backgroundColor: colors.bubble,
    borderRadius: radius.bubble,
    paddingVertical: 10,
    paddingHorizontal: 13,
    marginTop: space.xl,
  },
  userText: { fontSize: typography.body, lineHeight: typography.bodyLineHeight, color: "#e6dfd4" },
  userAttachments: { gap: 6, marginTop: 8 },
  userAttachment: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  userAttachmentName: { maxWidth: 220, fontSize: typography.small, color: "#e6dfd4" },
  assistantRow: { marginTop: space.sm },
  body: { fontSize: typography.body, lineHeight: typography.bodyLineHeight, color: colors.text },
  thinking: { fontSize: typography.body, lineHeight: typography.bodyLineHeight, color: colors.textFaint },
  artifact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  thumbnail: {
    width: 38,
    height: 30,
    borderRadius: 4,
    backgroundColor: colors.control,
  },
  artifactText: { flexShrink: 1 },
  artifactTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
  artifactSubtitle: { fontSize: typography.small, color: colors.textFaint, marginTop: 2 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    marginTop: space.lg,
  },
  sources: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 7 },
  dotStack: { flexDirection: "row" },
  dot: {
    width: 15,
    height: 15,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.canvas,
  },
  dotOverlap: { marginLeft: -4 },
  dotLetter: { fontSize: 8, fontWeight: "700", color: "#ffffff" },
  sourcesLabel: { fontSize: typography.small, color: colors.textMuted },
  cost: { fontSize: typography.small, color: "#776e64", marginTop: space.xs },
  disclaimer: { fontSize: typography.small, color: colors.textDisabled, marginTop: space.sm },
});
