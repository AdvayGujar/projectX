import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, space, typography } from "../theme";

export type DrawerSearchKind = "message" | "chunk";

/** One message part or document chunk, ready for a drawer row. */
export interface DrawerSearchItem {
  readonly key: string;
  readonly kind: DrawerSearchKind;
  readonly snippet: string;
  readonly meta: string;
  readonly sessionId?: string;
  readonly messageId?: string;
  readonly fileId?: string;
  readonly sourceUrl?: string;
}

export interface DrawerSearchGroup {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly items: readonly DrawerSearchItem[];
}

export interface DrawerSearchResultsProps {
  readonly groups: readonly DrawerSearchGroup[];
  readonly searching: boolean;
  readonly error: string | null;
  readonly onSelect: (item: DrawerSearchItem) => void;
}

interface SnippetSegment {
  readonly text: string;
  readonly emphasised: boolean;
}

/**
 * FTS snippets mark matches with square brackets. Split on the markers so the term can be
 * emphasised without re-parsing the query.
 */
export function splitSnippet(snippet: string): readonly SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  let buffer = "";
  let emphasised = false;

  for (const character of snippet) {
    if (character === "[") {
      pushSegment(segments, buffer, emphasised);
      buffer = "";
      emphasised = true;
    } else if (character === "]") {
      pushSegment(segments, buffer, emphasised);
      buffer = "";
      emphasised = false;
    } else {
      buffer += character;
    }
  }
  pushSegment(segments, buffer, emphasised);
  return segments;
}

function pushSegment(
  segments: SnippetSegment[],
  text: string,
  emphasised: boolean,
): void {
  if (text.length > 0) {
    segments.push({ text, emphasised });
  }
}

function plainSnippet(snippet: string): string {
  return splitSnippet(snippet)
    .map((segment) => segment.text)
    .join("");
}

/** Workspace search results, grouped by chat or document. Replaces Recents while typing. */
export function DrawerSearchResults({
  groups,
  searching,
  error,
  onSelect,
}: DrawerSearchResultsProps): ReactElement {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {groups.length === 0 && searching ? (
        <Text style={styles.status}>Searching…</Text>
      ) : null}
      {groups.length === 0 && !searching && !error ? (
        <Text style={styles.status}>No matches</Text>
      ) : null}

      {groups.map((group) => (
        <SearchGroup key={group.key} group={group} onSelect={onSelect} />
      ))}
    </ScrollView>
  );
}

interface SearchGroupProps {
  readonly group: DrawerSearchGroup;
  readonly onSelect: (item: DrawerSearchItem) => void;
}

function SearchGroup({ group, onSelect }: SearchGroupProps): ReactElement {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle} numberOfLines={1}>
          {group.title}
        </Text>
        <Text style={styles.groupSubtitle} numberOfLines={1}>
          {group.subtitle}
        </Text>
      </View>

      {group.items.map((item) => (
        <SearchRow key={item.key} groupTitle={group.title} item={item} onSelect={onSelect} />
      ))}
    </View>
  );
}

interface SearchRowProps {
  readonly groupTitle: string;
  readonly item: DrawerSearchItem;
  readonly onSelect: (item: DrawerSearchItem) => void;
}

function SearchRow({ groupTitle, item, onSelect }: SearchRowProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${groupTitle}: ${plainSnippet(item.snippet)}`}
      onPress={() => onSelect(item)}
      style={styles.row}
    >
      <Text style={styles.snippet} numberOfLines={2}>
        {splitSnippet(item.snippet).map((segment, index) => (
          <Text
            key={`${item.key}-${index}`}
            style={segment.emphasised ? styles.match : undefined}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
      {item.meta.length > 0 ? (
        <Text style={styles.meta} numberOfLines={1}>
          {item.meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 10, paddingBottom: space.sm },
  status: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    fontSize: typography.label,
    color: colors.textFaint,
  },
  error: {
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    fontSize: typography.label,
    lineHeight: 17,
    color: colors.danger,
  },
  group: { paddingBottom: space.xs },
  groupHeader: { paddingTop: space.sm, paddingHorizontal: space.sm, paddingBottom: 2 },
  groupTitle: { fontSize: typography.body, fontWeight: "600", color: colors.text },
  groupSubtitle: { fontSize: typography.small, color: colors.textFaint },
  row: {
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: space.sm,
    borderRadius: space.sm,
  },
  snippet: { fontSize: typography.label, lineHeight: 17, color: colors.textMuted },
  match: { fontWeight: "600", color: colors.text },
  meta: { marginTop: 2, fontSize: typography.small, color: colors.textFaint },
});
