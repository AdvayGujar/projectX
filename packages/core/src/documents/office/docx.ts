import JSZip from "jszip";

import { AppError } from "../../errors";
import {
  attribute,
  decodeXmlEntities,
  isCloseTag,
  isOpenTag,
  isSelfClosingTag,
  normalizeText,
  xmlTokens,
} from "./xml";
import type { ExtractedSection, ParsedDocument } from "./types";

const MAX_XML_CHARS = 50_000_000;
const DOCUMENT_PART = "word/document.xml";

interface SectionBuilder {
  heading: string | null;
  lines: string[];
}

/**
 * Reads the body of a DOCX. Headings start sections; tables become pipe-separated rows.
 * Text boxes, comments, and field codes are not part of the body text and are ignored.
 */
export async function parseDocx(bytes: Uint8Array): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(bytes);
  const part = zip.file(DOCUMENT_PART);
  if (!part) {
    throw unreadable("This Word document is missing its main text.");
  }
  const xml = await part.async("string");
  if (xml.length > MAX_XML_CHARS) {
    throw unreadable("This Word document is too large to read.");
  }
  return { sections: readSections(xml), pageCount: null, slideCount: null, sheetCount: null };
}

function readSections(xml: string): ExtractedSection[] {
  const sections: SectionBuilder[] = [];
  let current = builder(null);
  let paragraph: string[] = [];
  let paragraphStyle: string | null = null;
  let inText = false;
  let inCell = false;
  let cell: string[] = [];
  let row: string[] = [];

  for (const token of xmlTokens(xml)) {
    if (token.kind === "text") {
      if (inText) {
        paragraph.push(decodeXmlEntities(token.value));
      }
      continue;
    }
    const tag = token.value;
    if (isOpenTag(tag, "w:p")) {
      paragraph = [];
      paragraphStyle = null;
      continue;
    }
    if (isSelfClosingTag(tag, "w:pStyle")) {
      paragraphStyle = attribute(tag, "w:val");
      continue;
    }
    if (isSelfClosingTag(tag, "w:outlineLvl")) {
      paragraphStyle = paragraphStyle ?? headingFromOutline(attribute(tag, "w:val"));
      continue;
    }
    if (isOpenTag(tag, "w:t")) {
      inText = true;
      continue;
    }
    if (isCloseTag(tag, "w:t")) {
      inText = false;
      continue;
    }
    if (isSelfClosingTag(tag, "w:tab")) {
      paragraph.push("\t");
      continue;
    }
    if (isSelfClosingTag(tag, "w:br") || isSelfClosingTag(tag, "w:cr")) {
      paragraph.push("\n");
      continue;
    }
    if (isSelfClosingTag(tag, "w:noBreakHyphen")) {
      paragraph.push("-");
      continue;
    }
    if (isCloseTag(tag, "w:p")) {
      current = endParagraph(current, paragraph, paragraphStyle, inCell, sections);
      if (inCell) {
        cell.push(...splitParagraph(paragraph));
      }
      paragraph = [];
      continue;
    }
    if (isOpenTag(tag, "w:tbl")) {
      current.lines.push("");
      continue;
    }
    if (isCloseTag(tag, "w:tbl")) {
      current.lines.push("");
      continue;
    }
    if (isOpenTag(tag, "w:tr")) {
      row = [];
      continue;
    }
    if (isCloseTag(tag, "w:tr")) {
      const text = row.map((value) => value.replace(/\s+/gu, " ").trim()).filter(Boolean).join(" | ");
      if (text) {
        current.lines.push(text);
      }
      row = [];
      continue;
    }
    if (isOpenTag(tag, "w:tc")) {
      inCell = true;
      cell = [];
      continue;
    }
    if (isCloseTag(tag, "w:tc")) {
      const text = normalizeText(cell);
      if (text) {
        row.push(text);
      }
      inCell = false;
      cell = [];
      continue;
    }
    if (isOpenTag(tag, "w:body") || isCloseTag(tag, "w:body")) {
      continue;
    }
  }

  finish(current, sections);
  return sections.map((section) => ({
    page: null,
    section: section.heading,
    text: normalizeText(section.lines),
  })).filter((section) => section.text.length > 0);
}

function endParagraph(
  current: SectionBuilder,
  paragraph: readonly string[],
  style: string | null,
  inCell: boolean,
  sections: SectionBuilder[],
): SectionBuilder {
  if (inCell) {
    return current;
  }
  const text = normalizeText(splitParagraph(paragraph));
  if (!text) {
    return current;
  }
  const heading = headingLevel(style);
  if (heading !== null) {
    finish(current, sections);
    const next = builder(text);
    next.lines.push(text);
    return next;
  }
  current.lines.push(text);
  return current;
}

function splitParagraph(paragraph: readonly string[]): string[] {
  return paragraph.join("").split("\n");
}

function builder(heading: string | null): SectionBuilder {
  return { heading, lines: [] };
}

function finish(section: SectionBuilder, sections: SectionBuilder[]): void {
  if (normalizeText(section.lines).length > 0) {
    sections.push(section);
  }
}

function headingLevel(style: string | null): number | null {
  if (!style) {
    return null;
  }
  const normalized = style.trim().toLowerCase();
  if (normalized === "title") {
    return 0;
  }
  const match = /^heading(\d)$/.exec(normalized);
  return match ? Number(match[1]) : null;
}

function headingFromOutline(value: string | null): string | null {
  const level = Number(value);
  return Number.isInteger(level) && level >= 0 && level <= 5 ? `Heading${level + 1}` : null;
}

function unreadable(userMessage: string): AppError {
  return new AppError("tool_failed", userMessage, { userMessage });
}
