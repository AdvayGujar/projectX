import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, monoFont, radius, space, typography } from "../theme";
import type { Block, Segment } from "./parse";
import { parseBlocks, parseInline } from "./parse";

/**
 * Small first-party Markdown renderer for assistant text. The parser is pure and tested;
 * this file is only presentation.
 */
export function Markdown({ text }: { readonly text: string }): ReactElement {
  const blocks = parseBlocks(text);
  return (
    <View style={styles.root}>
      {blocks.map((block, index) => (
        <BlockView key={`${block.kind}-${index}`} block={block} />
      ))}
    </View>
  );
}

function BlockView({ block }: { readonly block: Block }): ReactElement {
  switch (block.kind) {
    case "heading":
      return (
        <Text style={[styles.heading, block.level === 1 ? styles.headingOne : styles.headingSmall]}>
          {inline(block.text)}
        </Text>
      );
    case "code":
      return (
        <View style={styles.code}>
          <Text style={styles.codeText}>{block.text}</Text>
        </View>
      );
    case "quote":
      return (
        <View style={styles.quote}>
          <Text style={styles.quoteText}>{inline(block.text)}</Text>
        </View>
      );
    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <View key={`${index}-${item}`} style={styles.listRow}>
              <Text style={styles.marker}>{block.ordered ? `${index + 1}.` : "•"}</Text>
              <Text style={styles.listText}>{inline(item)}</Text>
            </View>
          ))}
        </View>
      );
    default:
      return <Text style={styles.paragraph}>{inline(block.text)}</Text>;
  }
}

function inline(text: string): ReactElement[] {
  return parseInline(text).map((segment, index) => (
    <Text key={`${segment.kind}-${index}`} style={styleFor(segment.kind)}>
      {segment.text}
    </Text>
  ));
}

function styleFor(kind: Segment["kind"]) {
  switch (kind) {
    case "bold":
      return styles.bold;
    case "italic":
      return styles.italic;
    case "code":
      return styles.inlineCode;
    case "link":
      return styles.link;
    default:
      return undefined;
  }
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  paragraph: { fontSize: typography.body, lineHeight: typography.bodyLineHeight, color: colors.text },
  heading: { fontWeight: "700", color: colors.text },
  headingOne: { fontSize: 18, lineHeight: 24, marginTop: 2 },
  headingSmall: { fontSize: 15, lineHeight: 21, marginTop: 2 },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  link: { color: "#8fb8ff" },
  inlineCode: {
    fontFamily: monoFont,
    fontSize: 13,
    color: "#e6dfd4",
    backgroundColor: colors.control,
  },
  code: {
    backgroundColor: colors.control,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: space.md,
  },
  codeText: {
    fontFamily: monoFont,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#e6dfd4",
  },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: space.md,
  },
  quoteText: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
  },
  list: { gap: 4 },
  listRow: { flexDirection: "row", gap: space.sm },
  marker: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
    minWidth: 14,
  },
  listText: {
    flex: 1,
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.text,
  },
});
