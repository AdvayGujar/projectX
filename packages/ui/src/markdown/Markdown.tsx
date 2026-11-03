import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, monoFont, radius, space, typography } from "../theme";

interface Segment {
  readonly kind: "text" | "bold" | "italic" | "code" | "link";
  readonly text: string;
}

type Block =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "heading"; readonly level: number; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "quote"; readonly text: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly string[] };

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;
const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

/**
 * Small first-party Markdown renderer for assistant text: headings, paragraphs, lists,
 * quotes, fenced code and inline bold/italic/code/links. Written for streaming, so an
 * unterminated fence still renders as code instead of flashing raw backticks.
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

function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, index) });
    }
    segments.push(toSegment(match[0]));
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return segments;
}

function toSegment(token: string): Segment {
  if (token.startsWith("**")) {
    return { kind: "bold", text: token.slice(2, -2) };
  }
  if (token.startsWith("`")) {
    return { kind: "code", text: token.slice(1, -1) };
  }
  if (token.startsWith("[")) {
    const split = token.indexOf("](");
    return { kind: "link", text: token.slice(1, split) };
  }
  return { kind: "italic", text: token.slice(1, -1) };
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (FENCE.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: (heading[1] ?? "#").length, text: heading[2] ?? "" });
      index += 1;
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      blocks.push({ kind: "quote", text: quote[1] ?? "" });
      index += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      const parsed = collectList(lines, index, "bullet");
      blocks.push({ kind: "list", ordered: false, items: parsed.items });
      index = parsed.next;
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      const parsed = collectList(lines, index, "number");
      blocks.push({ kind: "list", ordered: true, items: parsed.items });
      index = parsed.next;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim().length === 0 ||
        HEADING.test(current) ||
        FENCE.test(current) ||
        BULLET.test(current) ||
        NUMBERED.test(current) ||
        QUOTE.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function collectList(
  lines: readonly string[],
  start: number,
  kind: "bullet" | "number",
): { items: string[]; next: number } {
  const pattern = kind === "bullet" ? BULLET : NUMBERED;
  const items: string[] = [];
  let index = start;
  while (index < lines.length) {
    const match = pattern.exec(lines[index] ?? "");
    if (!match) {
      break;
    }
    items.push(match[1] ?? "");
    index += 1;
  }
  return { items, next: index };
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
