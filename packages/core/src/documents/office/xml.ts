export interface XmlToken {
  readonly kind: "tag" | "text";
  readonly value: string;
}

const TAG_OR_TEXT = /<[^>]*>|[^<]+/g;
const TAG_NAME = /^<\/?([A-Za-z0-9:._-]+)/;
const ATTRIBUTE_CACHE = new Map<string, RegExp>();

/** A tiny OOXML tokenizer. It never builds a DOM, which keeps large parts off the heap. */
export function xmlTokens(xml: string): XmlToken[] {
  return Array.from(xml.matchAll(TAG_OR_TEXT), (match) => ({
    kind: match[0].startsWith("<") ? "tag" : "text",
    value: match[0],
  }));
}

export function tagName(tag: string): string | null {
  return TAG_NAME.exec(tag)?.[1] ?? null;
}

export function isOpenTag(tag: string, name: string): boolean {
  return tag.startsWith("<") && !tag.startsWith("</") && tagName(tag) === name && !tag.endsWith("/>");
}

export function isCloseTag(tag: string, name: string): boolean {
  return tag.startsWith("</") && tagName(tag) === name;
}

export function isSelfClosingTag(tag: string, name: string): boolean {
  return tag.startsWith("<") && tagName(tag) === name && tag.endsWith("/>");
}

export function attribute(tag: string, name: string): string | null {
  let pattern = ATTRIBUTE_CACHE.get(name);
  if (!pattern) {
    pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    ATTRIBUTE_CACHE.set(name, pattern);
  }
  const match = pattern.exec(tag);
  return match ? decodeXmlEntities(match[1] ?? match[2] ?? "") : null;
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) => fromCodePoint(hex, 16))
    .replace(/&#(\d+);/gu, (_match, decimal: string) => fromCodePoint(decimal, 10))
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&amp;/giu, "&");
}

export function normalizeText(lines: readonly string[]): string {
  return lines
    .flatMap((line) => line.split("\n"))
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function fromCodePoint(value: string, radix: 10 | 16): string {
  const code = Number.parseInt(value, radix);
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
