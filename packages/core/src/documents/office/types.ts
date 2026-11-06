/** One page, slide, sheet band, or heading section before chunking. */
export interface ExtractedSection {
  readonly page: number | null;
  readonly section: string | null;
  readonly text: string;
}

/** A spreadsheet row band already grouped so a range citation is exact. */
export interface SheetChunk {
  readonly page: number;
  readonly section: string;
  readonly text: string;
  readonly tokenEstimate: number;
}

export interface ParsedDocument {
  readonly sections: readonly ExtractedSection[];
  readonly pageCount: number | null;
  readonly slideCount: number | null;
  readonly sheetCount: number | null;
}

export interface ParsedSheet {
  readonly chunks: readonly SheetChunk[];
  readonly sheetCount: number;
}
