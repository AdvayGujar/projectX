import JSZip from "jszip";

import { AppError } from "../../errors";
import {
  attribute,
  decodeXmlEntities,
  isCloseTag,
  isOpenTag,
  isSelfClosingTag,
  normalizeText,
  tagName,
  xmlTokens,
} from "./xml";
import type { ExtractedSection, ParsedDocument } from "./types";

const MAX_XML_CHARS = 30_000_000;
const PRESENTATION_PART = "ppt/presentation.xml";
const PRESENTATION_RELS = "ppt/_rels/presentation.xml.rels";

interface SlidePart {
  readonly number: number;
  readonly path: string;
}

/**
 * Reads slide text and speaker notes in presentation order. Visual layout and notes-master
 * boilerplate are not reproduced; citations point at the slide number.
 */
export async function parsePptx(bytes: Uint8Array): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(bytes);
  const slides = await slideOrder(zip);
  const sections: ExtractedSection[] = [];

  for (const [index, slide] of slides.entries()) {
    const xml = await readPart(zip, slide.path);
    const paragraphs = extractParagraphs(xml);
    const title = paragraphs[0] ?? null;
    const notes = await readNotes(zip, slide.path, index + 1);
    const lines = [
      ...paragraphs,
      ...(notes.length > 0 ? ["Notes:", ...notes] : []),
    ];
    const text = normalizeText(lines);
    if (text) {
      sections.push({ page: slide.number, section: title, text });
    }
  }

  return {
    sections,
    pageCount: null,
    slideCount: slides.length,
    sheetCount: null,
  };
}

async function slideOrder(zip: JSZip): Promise<SlidePart[]> {
  const presentation = await readPart(zip, PRESENTATION_PART);
  const rels = await readRels(zip, PRESENTATION_RELS);
  const ordered: SlidePart[] = [];

  for (const token of xmlTokens(presentation)) {
    if (token.kind !== "tag" || tagName(token.value) !== "p:sldId") {
      continue;
    }
    const relId = attribute(token.value, "r:id");
    const target = relId === null ? undefined : rels.get(relId);
    if (target) {
      ordered.push({ number: ordered.length + 1, path: resolveZipPath("ppt", target) });
    }
  }

  if (ordered.length > 0) {
    return ordered;
  }

  const fallback = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  return fallback.map((path, index) => ({ number: index + 1, path }));
}

async function readNotes(
  zip: JSZip,
  slidePath: string,
  slideNumber: number,
): Promise<string[]> {
  const relsPath = slidePath.replace(/slides\/([^/]+)\.xml$/, "slides/_rels/$1.xml.rels");
  const rels = await readRels(zip, relsPath);
  const notesTarget = Array.from(rels.values()).find((target) => /notesSlide\d+\.xml$/.test(target));
  if (!notesTarget) {
    return [];
  }
  const notesPath = resolveZipPath(dirname(slidePath), notesTarget);
  const part = zip.file(notesPath);
  if (!part) {
    return [];
  }
  const xml = await part.async("string");
  return extractParagraphs(xml).filter(
    (paragraph) => paragraph !== String(slideNumber),
  );
}

function extractParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];
  let paragraph: string[] = [];
  let inText = false;

  for (const token of xmlTokens(xml)) {
    if (token.kind === "text") {
      if (inText) {
        paragraph.push(decodeXmlEntities(token.value));
      }
      continue;
    }
    const tag = token.value;
    if (isOpenTag(tag, "a:p")) {
      paragraph = [];
      continue;
    }
    if (isOpenTag(tag, "a:t")) {
      inText = true;
      continue;
    }
    if (isCloseTag(tag, "a:t")) {
      inText = false;
      continue;
    }
    if (isSelfClosingTag(tag, "a:br")) {
      paragraph.push("\n");
      continue;
    }
    if (isCloseTag(tag, "a:p")) {
      const text = normalizeText(paragraph);
      if (text) {
        paragraphs.push(text);
      }
      paragraph = [];
    }
  }

  return paragraphs;
}

async function readRels(zip: JSZip, path: string): Promise<Map<string, string>> {
  const part = zip.file(path);
  if (!part) {
    return new Map();
  }
  const xml = await part.async("string");
  const rels = new Map<string, string>();
  for (const token of xmlTokens(xml)) {
    if (token.kind !== "tag" || !token.value.startsWith("<Relationship")) {
      continue;
    }
    const id = attribute(token.value, "Id");
    const target = attribute(token.value, "Target");
    if (id && target) {
      rels.set(id, target);
    }
  }
  return rels;
}

async function readPart(zip: JSZip, path: string): Promise<string> {
  const part = zip.file(path);
  if (!part) {
    throw unreadable("This deck is missing a slide.");
  }
  const xml = await part.async("string");
  if (xml.length > MAX_XML_CHARS) {
    throw unreadable("This deck is too large to read.");
  }
  return xml;
}

function resolveZipPath(baseDir: string, target: string): string {
  const segments = target.startsWith("/")
    ? target.slice(1).split("/")
    : [...baseDir.split("/"), ...target.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return resolved.join("/");
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function slideNumber(path: string): number {
  return Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? 0);
}

function unreadable(userMessage: string): AppError {
  return new AppError("tool_failed", userMessage, { userMessage });
}
