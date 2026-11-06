/** Tool output is capped so one read cannot exhaust the model's context. */
export const MAX_TOOL_OUTPUT_CHARS = 8_000;

const TRUNCATION_NOTE = "\n\n[Output truncated. Ask for a narrower range or page.]";

/** Keeps tool text inside the cap while leaving a note the model can act on. */
export function capToolOutput(text: string, max = MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= max) {
    return text;
  }
  const room = Math.max(0, max - TRUNCATION_NOTE.length);
  return `${text.slice(0, room).trimEnd()}${TRUNCATION_NOTE}`;
}
