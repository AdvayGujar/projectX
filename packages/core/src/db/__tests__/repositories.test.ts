import { describe, expect, it } from "vitest";

import {
  createMessageRepository,
  createProjectRepository,
  createSessionRepository,
} from "../index";
import { withContext } from "./helpers";

describe("project repository", () => {
  it("creates, reads, lists, updates, and removes", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const created = await projects.create({ name: "  Drafts  ", instructions: "Keep it short" });

    expect(created.name).toBe("Drafts");
    expect(created.instructions).toBe("Keep it short");
    expect((await projects.get(created.id))?.id).toBe(created.id);
    expect((await projects.list()).map((project) => project.id)).toEqual([created.id]);

    const updated = await projects.update(created.id, { name: "Stories", icon: "book" });
    expect(updated.name).toBe("Stories");
    expect(updated.icon).toBe("book");
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);

    await projects.remove(created.id);
    expect(await projects.get(created.id)).toBeNull();
  }));

  it("rejects an empty name", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    await expect(projects.create({ name: "   " })).rejects.toMatchObject({ code: "db_invalid" });
  }));

  it("throws when updating a missing project", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    await expect(projects.update("missing", { name: "Nope" })).rejects.toMatchObject({
      code: "db_not_found",
    });
  }));
});

describe("session repository", () => {
  it("groups sessions by project and keeps standalone chats separate", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const project = await projects.create({ name: "Novel" });

    const grouped = await sessions.create({ projectId: project.id, title: "Chapter one" });
    const standalone = await sessions.create({ title: "Loose thought" });

    expect((await sessions.listByProject(project.id)).map((session) => session.id)).toEqual([grouped.id]);
    expect((await sessions.listByProject(null)).map((session) => session.id)).toEqual([standalone.id]);
    expect((await sessions.listRecent()).map((session) => session.id)).toEqual(
      expect.arrayContaining([grouped.id, standalone.id]),
    );
  }));

  it("updates title and pin state", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({ title: "Old" });
    const updated = await sessions.update(session.id, { title: "New", pinned: true });

    expect(updated.title).toBe("New");
    expect(updated.pinned).toBe(true);
  }));

  it("cascades messages when a session is removed", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});

    const message = await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "hello" }, searchText: "hello" }],
    });

    await sessions.remove(session.id);
    expect(await messages.get(message.id)).toBeNull();
    expect(await messages.count(session.id)).toBe(0);
  }));
});

describe("message repository", () => {
  it("appends messages and parts in order", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});

    const first = await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "first" }, searchText: "first" }],
    });
    const second = await messages.append({
      sessionId: session.id,
      role: "assistant",
      parts: [
        { type: "reasoning", data: { text: "thinking" } },
        { type: "text", data: { text: "second" }, searchText: "second" },
      ],
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(second.parts.map((part) => part.seq)).toEqual([1, 2]);

    const listed = await messages.list(session.id);
    expect(listed.map((message) => message.seq)).toEqual([1, 2]);
    expect(listed[1]?.parts[1]?.data).toEqual({ text: "second" });
    expect(await messages.count(session.id)).toBe(2);
  }));

  it("paginates backwards from a sequence", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});

    for (let index = 1; index <= 3; index += 1) {
      await messages.append({
        sessionId: session.id,
        role: "user",
        parts: [{ type: "text", data: { text: `message ${index}` }, searchText: `message ${index}` }],
      });
    }

    const latest = await messages.list(session.id, { limit: 2 });
    expect(latest.map((message) => message.seq)).toEqual([2, 3]);

    const older = await messages.list(session.id, { limit: 2, beforeSeq: 3 });
    expect(older.map((message) => message.seq)).toEqual([1, 2]);
  }));

  it("appends parts to an existing message", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const message = await messages.append({
      sessionId: session.id,
      role: "assistant",
      parts: [{ type: "text", data: { text: "partial" } }],
    });

    const part = await messages.appendPart(message.id, {
      type: "text",
      data: { text: " continued" },
      searchText: "continued",
    });

    expect(part.seq).toBe(2);
    expect((await messages.get(message.id))?.parts).toHaveLength(2);
  }));

  it("records status and usage", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const message = await messages.append({
      sessionId: session.id,
      role: "assistant",
      status: "streaming",
      effort: "High",
      parts: [],
    });

    await messages.updateStatus(message.id, "done", {
      inputTokens: 120,
      outputTokens: 40,
      cachedTokens: 10,
      costUsd: 0.0003,
    });

    const updated = await messages.get(message.id);
    expect(updated?.status).toBe("done");
    expect(updated?.inputTokens).toBe(120);
    expect(updated?.outputTokens).toBe(40);
    expect(updated?.cachedTokens).toBe(10);
    expect(updated?.costUsd).toBeCloseTo(0.0003);
    expect(updated?.effort).toBe("High");
  }));
});
