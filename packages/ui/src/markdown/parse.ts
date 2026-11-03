export interface Segment {
  readonly kind: "text" | "bold" | "italic" | "code" | "link";
  readonly text: string;
}

export type Block =
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
 * Pure block/inline parser behind `Markdown`. Kept free of React Native so it can be tested
 * and reused; an unterminated fence still yields a code block, which is what streaming needs.
 */
export function parseBlocks(text: string): Block[] {
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

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const match = QUOTE.exec(lines[index] ?? "");
        if (!match) {
          break;
        }
        quoted.push(match[1] ?? "");
        index += 1;
      }
      blocks.push({ kind: "quote", text: quoted.join("\n") });
      continue;
    }

    if (BULLET.test(line)) {
      const parsed = collectList(lines, index, "bullet");
      blocks.push({ kind: "list", ordered: false, items: parsed.items });
      index = parsed.next;
      continue;
    }

    if (NUMBERED.test(line)) {
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

export function parseInline(text: string): Segment[] {
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
