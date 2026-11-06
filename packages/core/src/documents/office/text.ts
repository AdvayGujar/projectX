import type { ExtractedSection, ParsedDocument } from "./types";

const HEADING = /^(#{1,6})\s+(.+)$/u;

/** Markdown headings start sections; plain text stays one section. */
export function parseText(text: string): ParsedDocument {
  const sections: ExtractedSection[] = [];
  let heading: string | null = null;
  let lines: string[] = [];

  const flush = (): void => {
    const body = lines.join("\n").trim();
    if (body) {
      sections.push({ page: null, section: heading, text: body });
    }
    lines = [];
  };

  for (const line of text.split(/\r?\n/u)) {
    const match = HEADING.exec(line);
    if (match) {
      flush();
      heading = (match[2] ?? "").trim();
      lines.push(line.trim());
      continue;
    }
    lines.push(line);
  }
  flush();

  return { sections, pageCount: null, slideCount: null, sheetCount: null };
}
