import * as XLSX from "xlsx";

import { AppError } from "../../errors";
import type { ParsedSheet, SheetChunk } from "./types";

const MAX_ROWS = 20_000;
const MAX_COLUMNS = 100;
const MAX_CHUNK_TOKENS = 1_200;

/** Reads values and formula text. The workbook is parsed in memory; bounds keep that safe. */
export function parseXlsxBytes(bytes: Uint8Array): ParsedSheet {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: true });
  return readWorkbook(workbook);
}

export function parseCsv(text: string, separator = ","): ParsedSheet {
  const workbook = XLSX.read(text, {
    type: "string",
    cellDates: true,
    cellFormula: true,
    FS: separator,
  });
  return readWorkbook(workbook);
}

function readWorkbook(workbook: XLSX.WorkBook): ParsedSheet {
  const chunks: SheetChunk[] = [];
  for (const [index, name] of workbook.SheetNames.entries()) {
    const sheet = workbook.Sheets[name];
    if (sheet) {
      chunks.push(...readSheet(name, sheet, index + 1));
    }
  }
  return { chunks, sheetCount: workbook.SheetNames.length };
}

function readSheet(name: string, sheet: XLSX.WorkSheet, page: number): SheetChunk[] {
  const reference = sheet["!ref"];
  if (!reference) {
    return [];
  }
  const range = XLSX.utils.decode_range(reference);
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  if (rowCount > MAX_ROWS || columnCount > MAX_COLUMNS) {
    throw new AppError("file_too_large", `Spreadsheet sheet ${name} is too large`, {
      userMessage: `This spreadsheet has more than ${MAX_ROWS} rows or ${MAX_COLUMNS} columns.`,
    });
  }

  const header = rowText(sheet, range.s.r, range);
  const chunks: SheetChunk[] = [];
  let lines: string[] = [];
  let startRow = -1;
  let lastRow = -1;
  let tokens = 0;

  const flush = (): void => {
    if (lines.length === 0 || startRow < 0) {
      return;
    }
    const prefix = header && startRow > range.s.r ? `${header}\n` : "";
    const text = `${prefix}${lines.join("\n")}`;
    chunks.push({
      page,
      section: `${name}!${cellAddress(range.s.c, startRow)}:${cellAddress(range.e.c, lastRow)}`,
      text,
      tokenEstimate: Math.ceil(text.length / 4),
    });
    lines = [];
    startRow = -1;
    tokens = 0;
  };

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const line = rowText(sheet, row, range);
    if (!line.trim()) {
      continue;
    }
    const lineTokens = Math.ceil(line.length / 4);
    if (lines.length > 0 && tokens + lineTokens > MAX_CHUNK_TOKENS) {
      flush();
    }
    if (startRow < 0) {
      startRow = row;
    }
    lines.push(line);
    lastRow = row;
    tokens += lineTokens;
  }
  flush();
  return chunks;
}

function rowText(
  sheet: XLSX.WorkSheet,
  row: number,
  range: XLSX.Range,
): string {
  const values: string[] = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    values.push(cellText(sheet[XLSX.utils.encode_cell({ r: row, c: column })]));
  }
  return values.join("\t").replace(/\t+$/u, "");
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) {
    return "";
  }
  const raw = cell.w ?? cell.v;
  const value = raw instanceof Date
    ? raw.toISOString().slice(0, 10)
    : raw === undefined || raw === null
      ? ""
      : String(raw);
  if (cell.f) {
    return value ? `${value} (=${cell.f})` : `=${cell.f}`;
  }
  return value.replace(/[\t\n\r]+/gu, " ");
}

function cellAddress(column: number, row: number): string {
  return `${XLSX.utils.encode_col(column)}${row + 1}`;
}
