export interface SheetRange {
  readonly startColumn: number;
  readonly startRow: number;
  readonly endColumn: number;
  readonly endRow: number;
}

export interface ChunkRange {
  readonly sheet: string;
  readonly range: SheetRange;
}

const RANGE_PATTERN = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/;
const SECTION_PATTERN = /^(.+)!([A-Z]+\d+(?::[A-Z]+\d+)?)$/;

/** Parses `A1:F40` or a single cell. Column numbers are zero-based. */
export function parseRange(value: string): SheetRange | null {
  const match = RANGE_PATTERN.exec(value.trim().toUpperCase().replace(/\$/g, ""));
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

/** Parses a chunk section such as `Budget!A1:H120`. */
export function parseChunkRange(section: string | null): ChunkRange | null {
  if (section === null) {
    return null;
  }
  const match = SECTION_PATTERN.exec(section);
  if (!match) {
    return null;
  }
  const range = parseRange(match[2] ?? "");
  return range ? { sheet: match[1] ?? "", range } : null;
}

export function rangesOverlap(left: SheetRange, right: SheetRange): boolean {
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
