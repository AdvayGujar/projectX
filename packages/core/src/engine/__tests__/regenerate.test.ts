import { describe, expect, it } from "vitest";

import { createMessageRepository, createSessionRepository } from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import { prepareRegeneration } from "../regenerate";

describe("regeneration", () => {
  it("returns the answered user turn and supersedes the reply", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const user = await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "Explain the report" } }],
    });
    const assistant = await messages.append({
      sessionId: session.id,
      role: "assistant",
      providerId: "provider-1",
      modelId: "deepseek-reasoner",
      effort: "High",
      usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.0021 },
      parts: [{ type: "text", data: { text: "Here it is" } }],
    });

    const target = await prepareRegeneration(ctx, session.id, assistant.id);

    expect(target).toEqual({
      selectionId: "provider-1:deepseek-reasoner",
      effort: "High",
      reasoning: { mode: "on", effort: "high" },
      text: "Explain the report",
    });
    expect((await messages.list(session.id)).map((message) => message.id)).toEqual([
      user.id,
      assistant.id,
    ]);
    const kept = await messages.get(assistant.id);
    expect(kept?.superseded).toBe(true);
    expect(kept?.costUsd).toBeCloseTo(0.0021);
    const parts = await ctx.db.execute("SELECT COUNT(*) AS count FROM parts WHERE message_id = ?", [
      assistant.id,
    ]);
    expect(Number(parts.rows[0]?.count)).toBe(1);
  }));

  it("refuses to regenerate a reply that is no longer the latest", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const user = await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "First" } }],
    });
    const assistant = await messages.append({
      sessionId: session.id,
      role: "assistant",
      providerId: "provider-1",
      modelId: "model-1",
      parts: [{ type: "text", data: { text: "Old reply" } }],
    });
    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "Second" } }],
    });

    expect(await prepareRegeneration(ctx, session.id, assistant.id)).toBeNull();
    expect(await messages.count(session.id)).toBe(3);
    expect(user.seq).toBe(1);
  }));
});
