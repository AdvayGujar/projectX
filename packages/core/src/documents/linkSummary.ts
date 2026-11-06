/// <reference path="../html-to-text.d.ts" />
import { convert } from "html-to-text";

const SUMMARY_TEXT_CHARS = 1_500;
const MAX_SUMMARY_CHARS = 2_000;
const MAX_TITLE_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 300;

const TITLE_TAG = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const META_TAG = /<meta\b[^>]*>/gi;
const DESCRIPTION_ATTRIBUTE = /\bname\s*=\s*["']?description["']?/i;
const CONTENT_ATTRIBUTE = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Readable text only: navigation, chrome, and non-text SVG are dropped. `script` and `style`
 * would otherwise leak source into the summary.
 */
const HTML_TO_TEXT_OPTIONS = {
  wordwrap: false,
  selectors: [
    { selector: "script", format: "skip" },
    { selector: "style", format: "skip" },
    { selector: "noscript", format: "skip" },
    { selector: "svg", format: "skip" },
    { selector: "nav", format: "skip" },
    { selector: "footer", format: "skip" },
    { selector: "header", format: "skip" },
    // Headings stay in sentence case in the stored summary.
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
    { selector: "h3", options: { uppercase: false } },
    { selector: "h4", options: { uppercase: false } },
    { selector: "h5", options: { uppercase: false } },
    { selector: "h6", options: { uppercase: false } },
  ],
} as const;

export interface ExtractedPage {
  readonly title: string;
  readonly description: string;
  readonly text: string;
}

export function extractPage(html: string, fallbackTitle: string): ExtractedPage {
  return {
    title: readTitle(html) ?? fallbackTitle,
    description: readDescription(html),
    text: normalizeText(convert(html, HTML_TO_TEXT_OPTIONS)),
  };
}

/** Title, description, then the opening page text, capped at the summary budget. */
export function buildSummary(page: ExtractedPage): string {
  const body = Array.from(page.text).slice(0, SUMMARY_TEXT_CHARS).join("");
  const summary = [page.title, page.description, body.trim()]
    .filter((part) => part.length > 0)
    .join("\n\n");
  return Array.from(summary).slice(0, MAX_SUMMARY_CHARS).join("").trim();
}

function readTitle(html: string): string | null {
  const match = TITLE_TAG.exec(html);
  return match ? clip(decodeEntities(match[1] ?? ""), MAX_TITLE_CHARS) : null;
}

/** Reads the first `<meta name="description">` regardless of attribute order. */
function readDescription(html: string): string {
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0];
    if (!DESCRIPTION_ATTRIBUTE.test(tag)) {
      continue;
    }
    const content = CONTENT_ATTRIBUTE.exec(tag);
    const value = content?.[1] ?? content?.[2] ?? "";
    const description = clip(decodeEntities(value), MAX_DESCRIPTION_CHARS);
    if (description) {
      return description;
    }
  }
  return "";
}

function normalizeText(text: string): string {
  return text.replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
}

function clip(value: string, max: number): string {
  return Array.from(value.replace(/\s+/gu, " ").trim()).slice(0, max).join("");
}

function decodeEntities(value: string): string {
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

function fromCodePoint(value: string, radix: 10 | 16): string {
  const code = Number.parseInt(value, radix);
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "";
}
