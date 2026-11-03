import type { ReactElement } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import type { SourceRef, ViewTurn } from "../types";
import { Thought } from "./Thought";

export interface TranscriptProps {
  readonly turns: readonly ViewTurn[];
  readonly onCopy: (turnId: string) => void;
  readonly onRegenerate: (turnId: string) => void;
  readonly onReadAloud: (turnId: string) => void;
  readonly onOpenSources: (turnId: string) => void;
}

const DISCLAIMER = "AI can make mistakes. Check generated files before sharing.";

export function Transcript({
  turns,
  onCopy,
  onRegenerate,
  onReadAloud,
  onOpenSources,
}: TranscriptProps): ReactElement {
  const [openThoughtId, setOpenThoughtId] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      {turns.map((turn) =>
        turn.role === "user" ? (
          <View key={turn.id} style={styles.userRow}>
            <Text style={styles.userText}>{turn.text}</Text>
          </View>
        ) : (
          <View key={turn.id} style={styles.assistantRow}>
            {turn.reasoning ? (
              <Thought
                summary={summarise(turn)}
                reasoning={turn.reasoning}
                activity={turn.activity ?? []}
                open={openThoughtId === turn.id}
                onToggle={() =>
                  setOpenThoughtId((current) => (current === turn.id ? null : turn.id))
                }
              />
            ) : null}

            <Text style={styles.body}>{turn.text}</Text>

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
          </View>
        ),
      )}
    </View>
  );
}

function summarise(turn: ViewTurn): string {
  const activity = turn.activity ?? [];
  const reads = activity.filter((item) => item.kind === "read").length;
  const parts = ["Thought"];
  if (activity.length > 0) {
    parts.push(`${activity.length} tool${activity.length === 1 ? "" : "s"}`);
  }
  if (reads > 0) {
    parts.push(`${reads} document${reads === 1 ? "" : "s"} read`);
  }
  return parts.join(" · ");
}

function costLine(cost: NonNullable<ViewTurn["cost"]>): string {
  return [cost.model, cost.effort, cost.tokens, cost.usd]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
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
  assistantRow: { marginTop: space.sm },
  body: { fontSize: typography.body, lineHeight: typography.bodyLineHeight, color: colors.text },
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
