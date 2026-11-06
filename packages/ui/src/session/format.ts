import type { ViewTurn } from "../types";

/** Pure formatting used by the transcript; kept free of React Native for testing. */

const DOCUMENT_READ_TOOLS: ReadonlySet<string> = new Set(["read_document", "read_sheet"]);

export function summarise(turn: ViewTurn): string {
  const activity = turn.activity ?? [];
  const reads = activity.filter(
    (item) => item.kind === "read" && DOCUMENT_READ_TOOLS.has(item.tool),
  ).length;
  const parts = ["Thought"];
  if (activity.length > 0) {
    parts.push(`${activity.length} tool${activity.length === 1 ? "" : "s"}`);
  }
  if (reads > 0) {
    parts.push(`${reads} document${reads === 1 ? "" : "s"} read`);
  }
  return parts.join(" · ");
}

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  off: "Off",
  on: "On",
  standard: "Standard",
};

/** Stored values are lower case; older messages may hold display values. */
export function effortLabel(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return EFFORT_LABELS[value.trim().toLowerCase()] ?? value;
}

export function costLine(cost: NonNullable<ViewTurn["cost"]>): string {
  return [cost.model, cost.effort ? effortLabel(cost.effort) : undefined, cost.tokens, cost.usd]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function streamingLabel(reasoningRequested: boolean | undefined): string {
  return reasoningRequested === false ? "Generating…" : "Thinking…";
}
