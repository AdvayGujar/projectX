import type { ChunkDraft } from "../db";

const CHARACTERS_PER_TOKEN = 4;

export interface PdfPageText {
  readonly page: number;
  readonly text: string;
}

export interface ChunkOptions {
  readonly targetTokens?: number;
  readonly minTokens?: number;
  readonly maxTokens?: number;
  readonly overlapRatio?: number;
}

const DEFAULTS = {
  targetTokens: 1000,
  minTokens: 800,
  maxTokens: 1200,
  overlapRatio: 0.15,
} satisfies Required<ChunkOptions>;

interface NormalizedOptions {
  readonly targetTokens: number;
  readonly minTokens: number;
  readonly maxTokens: number;
  readonly overlapRatio: number;
}

interface PageDraft {
  readonly page: number;
  readonly text: string;
  readonly tokenEstimate: number;
}

interface WordRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Splits each page independently: chunks never cross a page boundary, so every citation can
 * point at one page. Pages that fit inside the budget stay whole; longer pages are split on
 * word boundaries and overlap by trailing words.
 */
export function chunkPages(
  pages: readonly PdfPageText[],
  options: ChunkOptions = {},
): ChunkDraft[] {
  const normalized = normalizeOptions(options);
  const drafts: ChunkDraft[] = [];

  for (const page of pages) {
    for (const draft of chunkPage(page, normalized)) {
      drafts.push({
        ordinal: drafts.length + 1,
        page: draft.page,
        section: null,
        text: draft.text,
        tokenEstimate: draft.tokenEstimate,
      });
    }
  }

  return drafts;
}

function chunkPage(page: PdfPageText, options: NormalizedOptions): PageDraft[] {
  const words = tokenize(page.text, options.maxTokens);
  if (words.length === 0) {
    return [];
  }

  const fullText = words.join(" ");
  if (estimateTokens(fullText) <= options.maxTokens) {
    return [pageDraft(page.page, fullText)];
  }

  const ranges = mergeShortTail(buildRanges(words, options), words, options);
  return ranges.map((range) => pageDraft(page.page, joinRange(words, range)));
}

function buildRanges(words: readonly string[], options: NormalizedOptions): WordRange[] {
  const ranges: WordRange[] = [];
  let start = 0;

  while (start < words.length) {
    const end = findChunkEnd(words, start, options);
    ranges.push({ start, end });
    if (end >= words.length) {
      break;
    }
    start = nextStart(words, start, end, options);
  }

  return ranges;
}

function findChunkEnd(
  words: readonly string[],
  start: number,
  options: NormalizedOptions,
): number {
  let end = start;
  let characters = 0;

  while (end < words.length) {
    const word = words[end];
    if (word === undefined) {
      break;
    }
    const nextCharacters = characters + (end === start ? 0 : 1) + word.length;
    const nextTokens = Math.ceil(nextCharacters / CHARACTERS_PER_TOKEN);
    if (end > start && nextTokens > options.maxTokens) {
      break;
    }
    characters = nextCharacters;
    end += 1;
    if (Math.ceil(characters / CHARACTERS_PER_TOKEN) >= options.targetTokens) {
      break;
    }
  }

  return end;
}

function nextStart(
  words: readonly string[],
  start: number,
  end: number,
  options: NormalizedOptions,
): number {
  const budget = Math.floor(options.targetTokens * options.overlapRatio) * CHARACTERS_PER_TOKEN;
  if (budget <= 0) {
    return end;
  }

  let index = end;
  let characters = 0;
  while (index > start) {
    const word = words[index - 1];
    if (word === undefined) {
      break;
    }
    const candidate = characters + (index === end ? 0 : 1) + word.length;
    if (candidate > budget) {
      break;
    }
    characters = candidate;
    index -= 1;
  }

  // Always move forward, even when the overlap budget covers the whole chunk.
  return Math.min(Math.max(index, start + 1), end);
}

/** A short final range is folded into its neighbour when the result still fits the budget. */
function mergeShortTail(
  ranges: readonly WordRange[],
  words: readonly string[],
  options: NormalizedOptions,
): WordRange[] {
  const last = ranges[ranges.length - 1];
  const previous = ranges[ranges.length - 2];
  if (!last || !previous || estimateRange(words, last) >= options.minTokens) {
    return [...ranges];
  }

  const merged: WordRange = { start: previous.start, end: last.end };
  if (estimateRange(words, merged) > options.maxTokens) {
    return [...ranges];
  }
  return [...ranges.slice(0, -2), merged];
}

function tokenize(text: string, maxTokens: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const maxCharacters = maxTokens * CHARACTERS_PER_TOKEN;
  return words.flatMap((word) => splitOversizedWord(word, maxCharacters));
}

/** A word longer than the chunk budget is cut by characters as a last resort. */
function splitOversizedWord(word: string, maxCharacters: number): string[] {
  if (word.length <= maxCharacters) {
    return [word];
  }
  const pieces: string[] = [];
  for (let start = 0; start < word.length; start += maxCharacters) {
    pieces.push(word.slice(start, start + maxCharacters));
  }
  return pieces;
}

function pageDraft(page: number, text: string): PageDraft {
  return { page, text, tokenEstimate: estimateTokens(text) };
}

function estimateRange(words: readonly string[], range: WordRange): number {
  return estimateTokens(joinRange(words, range));
}

function joinRange(words: readonly string[], range: WordRange): string {
  return words.slice(range.start, range.end).join(" ");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}

function normalizeOptions(options: ChunkOptions): NormalizedOptions {
  const maxTokens = positive(options.maxTokens, DEFAULTS.maxTokens);
  const targetTokens = Math.min(positive(options.targetTokens, DEFAULTS.targetTokens), maxTokens);
  const minTokens = Math.min(positive(options.minTokens, DEFAULTS.minTokens), targetTokens);
  return {
    targetTokens,
    minTokens,
    maxTokens,
    overlapRatio: clampRatio(options.overlapRatio),
  };
}

function positive(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function clampRatio(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULTS.overlapRatio;
  }
  return Math.min(Math.max(value, 0), 1);
}
