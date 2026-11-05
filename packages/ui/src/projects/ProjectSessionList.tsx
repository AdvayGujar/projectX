import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, space, typography } from "../theme";

const DEFAULT_EMPTY_TEXT = "No chats in this project yet.";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface ProjectSessionSummary {
  readonly id: string;
  readonly title: string;
  readonly pinned: boolean;
  readonly lastActivityAt: number | null;
}

export interface ProjectSessionListProps {
  readonly sessions: readonly ProjectSessionSummary[];
  readonly onSelect: (id: string) => void;
  readonly emptyText?: string;
}

/** Chat rows inside a project: title plus pin/last-activity meta. */
export function ProjectSessionList({
  sessions,
  onSelect,
  emptyText = DEFAULT_EMPTY_TEXT,
}: ProjectSessionListProps): ReactElement {
  const now = Date.now();

  if (sessions.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {sessions.map((session) => (
        <Pressable
          key={session.id}
          accessibilityRole="button"
          accessibilityLabel={session.title}
          onPress={() => onSelect(session.id)}
          style={styles.row}
        >
          <View style={styles.rowText}>
            <Text style={styles.title} numberOfLines={1}>
              {session.title}
            </Text>
            <Text style={styles.meta}>{describe(session, now)}</Text>
          </View>
          <Icon name="chevron" size={14} color={colors.textFaint} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function describe(session: ProjectSessionSummary, now: number): string {
  const activity =
    session.lastActivityAt === null ? "No messages yet" : relativeTime(session.lastActivityAt, now);
  return session.pinned ? `Pinned · ${activity}` : activity;
}

function relativeTime(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE) {
    return "Just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h ago`;
  }
  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)}d ago`;
  }
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""} ${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  empty: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: typography.body, color: colors.text },
  meta: { fontSize: typography.small, color: colors.textMuted },
});
