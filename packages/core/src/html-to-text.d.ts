/**
 * `html-to-text` 10.0.1 ships no type definitions. This is the subset the link importer
 * uses; expand it only when a new option is actually needed.
 *
 * `links.ts` references this file explicitly because the mobile app compiles core from
 * source and would not otherwise include a sibling declaration.
 */
declare module "html-to-text" {
  export interface HtmlToTextSelector {
    readonly selector: string;
    readonly format?: string;
    readonly options?: Readonly<Record<string, unknown>>;
  }

  export interface HtmlToTextBaseElements {
    readonly selectors?: readonly string[];
    readonly orderBy?: "selectors" | "occurrence";
    readonly returnDomByDefault?: boolean;
  }

  export interface HtmlToTextLimits {
    readonly maxInputLength?: number;
    readonly maxDepth?: number;
    readonly ellipsis?: string;
  }

  export interface HtmlToTextOptions {
    readonly wordwrap?: number | false | null;
    readonly selectors?: readonly HtmlToTextSelector[];
    readonly baseElements?: HtmlToTextBaseElements;
    readonly limits?: HtmlToTextLimits;
    readonly decodeEntities?: boolean;
  }

  export function convert(html: string, options?: HtmlToTextOptions): string;
  export const htmlToText: typeof convert;
}
