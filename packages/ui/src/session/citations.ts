import type { CitationRef } from "../types";

export type CitationToken =
  | { readonly kind: "page"; readonly text: string; readonly start: number; readonly end: number; readonly page: number }
  | { readonly kind: "slide"; readonly text: string; readonly start: number; readonly end: number; readonly slide: number }
  | {
    readonly kind: "sheet";
    readonly text: string;
    readonly start: number;
    readonly end: number;
    readonly sheet: string;
    readonly range: string;
  };

/** A citation the assistant actually referenced in its answer, with the chip label. */
export interface CitedCitation {
  readonly citation: CitationRef;
  readonly label: string;
}

/** Models cite as `p.12`, `Slide 4`, or `Budget!C2`; only those forms become chips. */
export function findCitationTokens(
  text: string,
  citations: readonly CitationRef[] = [],
): CitationToken[] {
  const tokens: CitationToken[] = [];
  const sheetNames = citationSheetNames(citations);
  const sheetPattern = sheetNames.length > 0
    ? `(?:${sheetNames.map(escapeRegExp).join("|")})`
    : "[A-Za-z0-9_.-]+";
  const pattern = new RegExp(
    `\\bp\\.\\s?(\\d+)\\b|\\bSlide\\s+(\\d+)\\b|\\b(${sheetPattern})!\\s*([A-Za-z]+\\d+(?::[A-Za-z]+\\d+)?)\\b`,
    "gi",
  );
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const value = match[0];
    if (match[1] !== undefined) {
      tokens.push({
        kind: "page",
        text: value,
        start: index,
        end: index + value.length,
        page: Number(match[1]),
      });
    } else if (match[2] !== undefined) {
      tokens.push({
        kind: "slide",
        text: value,
        start: index,
        end: index + value.length,
        slide: Number(match[2]),
      });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      tokens.push({
        kind: "sheet",
        text: value,
        start: index,
        end: index + value.length,
        sheet: match[3].trim(),
        range: match[4],
      });
    }
  }
  return tokens;
}

/**
 * Maps an inline reference to a citation the turn actually read. When several files
 * match, the file name nearest before the reference wins.
 */
export function resolveCitation(
  token: CitationToken,
  citations: readonly CitationRef[],
  context: string,
): CitationRef | null {
  const candidates = token.kind === "page"
    ? citations.filter((citation) => citation.fileKind === "pdf" && citation.page === token.page)
    : token.kind === "slide"
      ? citations.filter(
        (citation) => citation.fileKind === "pptx" && citation.page === token.slide,
      )
      : citations.filter((citation) =>
        matchesSheet(citation, token.sheet, token.range)
      );

  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const lowered = context.toLowerCase();
  let best: CitationRef | null = null;
  let bestIndex = -1;
  for (const candidate of candidates) {
    const index = lowered.lastIndexOf(candidate.fileName.toLowerCase());
    if (index > bestIndex) {
      best = candidate;
      bestIndex = index;
    }
  }
  return bestIndex >= 0 ? best : null;
}

/**
 * Citations referenced in the answer, in reading order. A turn may read more pages than it
 * cites; only the referenced ones become chips.
 */
export function citedCitations(
  text: string,
  citations: readonly CitationRef[],
): CitedCitation[] {
  const cited: CitedCitation[] = [];
  const seen = new Set<string>();
  for (const token of findCitationTokens(text, citations)) {
    const citation = resolveCitation(
      token,
      citations,
      text.slice(Math.max(0, token.start - 180), token.start),
    );
    if (!citation) {
      continue;
    }
    const label = token.text.replace(/^p\.\s+/i, "p.");
    const key = `${label}:${citation.fileId}:${citation.page ?? "-"}:${citation.section ?? "-"}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    cited.push({ citation, label });
  }
  return cited;
}

export function citationLocation(citation: CitationRef): string {
  if (citation.fileKind === "xlsx" && citation.section !== null) {
    return citation.section;
  }
  if (citation.fileKind === "pptx" && citation.page !== null) {
    return `Slide ${citation.page}`;
  }
  if (citation.page !== null) {
    return `p.${citation.page}`;
  }
  return citation.section ?? "";
}

function matchesSheet(citation: CitationRef, sheet: string, range: string): boolean {
  if (citation.fileKind !== "xlsx" || citation.section === null) {
    return false;
  }
  const parsed = parseSection(citation.section);
  if (!parsed || parsed.sheet.toLowerCase() !== sheet.toLowerCase()) {
    return false;
  }
  const wanted = parseRange(range);
  return wanted ? rangesOverlap(parsed.range, wanted) : true;
}

interface SheetRange {
  readonly startColumn: number;
  readonly startRow: number;
  readonly endColumn: number;
  readonly endRow: number;
}

const RANGE = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/;

function parseSection(value: string): { sheet: string; range: SheetRange } | null {
  const separator = value.lastIndexOf("!");
  if (separator <= 0) {
    return null;
  }
  const range = parseRange(value.slice(separator + 1));
  return range ? { sheet: value.slice(0, separator), range } : null;
}

function parseRange(value: string): SheetRange | null {
  const match = RANGE.exec(value.trim().toUpperCase().replace(/\$/g, ""));
  if (!match) {
    return null;
  }
  const startColumn = columnIndex(match[1] ?? "");
  const startRow = Number(match[2]) - 1;
  const endColumn = match[3] === undefined ? startColumn : columnIndex(match[3]);
  const endRow = match[4] === undefined ? startRow : Number(match[4]) - 1;
  if (startColumn < 0 || endColumn < 0 || startRow < 0 || endRow < 0) {
    return null;
  }
  return {
    startColumn: Math.min(startColumn, endColumn),
    startRow: Math.min(startRow, endRow),
    endColumn: Math.max(startColumn, endColumn),
    endRow: Math.max(startRow, endRow),
  };
}

function rangesOverlap(left: SheetRange, right: SheetRange): boolean {
  return (
    left.startRow <= right.endRow &&
    left.endRow >= right.startRow &&
    left.startColumn <= right.endColumn &&
    left.endColumn >= right.startColumn
  );
}

function columnIndex(value: string): number {
  let result = 0;
  for (const character of value) {
    result = result * 26 + (character.charCodeAt(0) - 64);
  }
  return result - 1;
}

function citationSheetNames(citations: readonly CitationRef[]): string[] {
  const names = new Set<string>();
  for (const citation of citations) {
    const parsed = citation.section === null ? null : parseSection(citation.section);
    if (parsed) {
      names.add(parsed.sheet);
    }
  }
  return [...names].sort((left, right) => right.length - left.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
