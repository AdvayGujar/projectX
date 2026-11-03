export type SpikeAction =
  | "pptx"
  | "xlsx"
  | "docx"
  | "pdf"
  | "db"
  | "pdf-fixture"
  | "list";

const PREFIX = "projectx://spike/";
const ACTIONS = new Set<string>([
  "pptx",
  "xlsx",
  "docx",
  "pdf",
  "db",
  "pdf-fixture",
  "list",
]);

export function actionFromUrl(url: string): SpikeAction | null {
  if (!url.startsWith(PREFIX)) {
    return null;
  }
  const action = url.slice(PREFIX.length).split(/[/?#]/)[0] ?? "";
  return parseAction(action);
}

export function parseAction(value: string): SpikeAction | null {
  const action = value.trim();
  return ACTIONS.has(action) ? (action as SpikeAction) : null;
}
