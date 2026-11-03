import type { RecentSession, ViewTurn } from "@projectx/ui";

/**
 * Placeholder content for the shell. Sessions are not wired to SQLite yet; this file is
 * deleted when `TurnService` and the session repository are connected.
 */
export interface SessionFixture {
  readonly id: string;
  readonly title: string;
  readonly turns: readonly ViewTurn[];
}

const Q4_TURNS: readonly ViewTurn[] = [
  {
    id: "turn-1",
    role: "user",
    text: "Turn the Q4 roadmap doc into a 6-slide deck for Monday.",
  },
  {
    id: "turn-2",
    role: "assistant",
    text:
      "Here's the deck: one slide per roadmap theme, plus a closing slide on the two decisions " +
      "you still owe. I kept the numbers from the doc and cut the staffing detail.",
    reasoning:
      "The roadmap has twelve pages and two unresolved decisions. I'll map one theme per slide, " +
      "keep the numbers exactly as written, and drop the staffing detail because it isn't in the " +
      "decisions you owe.",
    activity: [
      { kind: "read", tool: "read_document", detail: "q4-roadmap.docx · pages 1–12" },
      { kind: "wrote", tool: "create_presentation", detail: "6 slides · v1" },
    ],
    artifact: { title: "Q4 Roadmap — 6 slides", subtitle: "deck · v1 · generated just now" },
    sources: [
      { title: "Q4 roadmap — internal draft", domain: "notion.so" },
      { title: "Pricing changes for Q4", domain: "linear.app" },
      { title: "Deck template guidelines", domain: "slidesgo.com" },
    ],
    cost: { model: "Sonnet 4.5", effort: "High", tokens: "2,148 in / 412 out", usd: "$0.02" },
  },
];

const PRICING_TURNS: readonly ViewTurn[] = [
  {
    id: "turn-3",
    role: "user",
    text: "Rewrite the pricing page for the new tiers.",
  },
];

export const SESSION_FIXTURES: readonly SessionFixture[] = [
  { id: "q4-roadmap", title: "Q4 roadmap deck for Monday", turns: Q4_TURNS },
  { id: "pricing-page", title: "Pricing page rewrite", turns: PRICING_TURNS },
  { id: "hackathon", title: "Meta hackathon ideas", turns: PRICING_TURNS },
  { id: "lease", title: "Reading the lease", turns: PRICING_TURNS },
];

export const RECENT_SESSIONS: readonly RecentSession[] = SESSION_FIXTURES.map((fixture) => ({
  id: fixture.id,
  title: fixture.title,
}));

export function findSession(id: string): SessionFixture | undefined {
  return SESSION_FIXTURES.find((fixture) => fixture.id === id);
}
