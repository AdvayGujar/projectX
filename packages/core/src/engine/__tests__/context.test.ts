import { describe, expect, it } from "vitest";

import { createMessageRepository, createSessionRepository } from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import { buildContext } from "../context";

describe("context builder", () => {
  it("converts history, includes the summary, and drops reasoning", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    await sessions.setSummary(session.id, "They discussed a report.", 2);

    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "Summarise this" }, searchText: "Summarise this" }],
    });
    await messages.append({
      sessionId: session.id,
      role: "assistant",
      parts: [
        { type: "reasoning", data: { text: "internal" } },
        { type: "text", data: { text: "Reading the report" }, searchText: "Reading the report" },
        {
          type: "tool_call",
          data: { id: "c1", name: "read_document", arguments: { page: 1 } },
        },
      ],
    });
    await messages.append({
      sessionId: session.id,
      role: "tool",
      parts: [{
        type: "tool_result",
        data: { toolCallId: "c1", name: "read_document", content: "page one" },
      }],
    });

    const context = await buildContext(ctx, session.id, { system: "You are helpful.", maxTokens: 10_000 });

    expect(context.system).toContain("Conversation summary so far");
    expect(context.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(context.messages[1]?.parts.some((part) => part.type === "tool_call")).toBe(true);
    expect(JSON.stringify(context.messages[1])).not.toContain("internal");
  }));

  it("keeps at least the newest message when the budget is tiny", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const longText = "word ".repeat(2_000);
    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: longText }, searchText: longText }],
    });
    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: longText }, searchText: longText }],
    });

    const context = await buildContext(ctx, session.id, { system: "", maxTokens: 1 });
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0]?.parts[0]).toEqual({ type: "text", text: longText });
  }));
});
