import { describe, expect, it } from "vitest";

import type { ProjectLinkStatus } from "../types";
import {
  createFileRepository,
  createProjectLinkRepository,
  createProjectRepository,
} from "../index";
import { withContext } from "./helpers";

describe("project link repository", () => {
  it("adds, reads, lists, updates, and removes", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const links = createProjectLinkRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const other = await projects.create({ name: "Elsewhere" });

    const first = await links.add({
      projectId: project.id,
      url: "  https://example.com/report  ",
      title: "  Quarterly report  ",
    });
    const second = await links.add({
      projectId: project.id,
      url: "https://example.com/budget",
      title: "Budget",
      mediaType: "text/html",
    });
    await links.add({
      projectId: other.id,
      url: "https://example.com/other",
      title: "Other",
    });

    expect(first).toMatchObject({
      projectId: project.id,
      url: "https://example.com/report",
      title: "Quarterly report",
      mediaType: null,
      snapshotFileId: null,
      status: "pending",
      error: null,
      fetchedAt: null,
    });
    expect((await links.get(first.id))?.id).toBe(first.id);
    expect(await links.get("missing")).toBeNull();
    expect((await links.listByProject(project.id)).map((link) => link.id)).toEqual([
      second.id,
      first.id,
    ]);

    const updated = await links.update(first.id, {
      status: "ready",
      mediaType: "text/html",
      fetchedAt: 1_700_000_000_000,
      title: "Report",
    });
    expect(updated).toMatchObject({
      title: "Report",
      status: "ready",
      mediaType: "text/html",
      fetchedAt: 1_700_000_000_000,
    });

    await links.remove(first.id);
    expect(await links.get(first.id)).toBeNull();
  }));

  it("rejects an empty url or title", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const links = createProjectLinkRepository(ctx);
    const project = await projects.create({ name: "Reports" });

    await expect(links.add({
      projectId: project.id,
      url: "   ",
      title: "Report",
    })).rejects.toMatchObject({ code: "db_invalid" });

    await expect(links.add({
      projectId: project.id,
      url: "https://example.com",
      title: "   ",
    })).rejects.toMatchObject({ code: "db_invalid" });
  }));

  it("rejects an unknown status through the table check", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const links = createProjectLinkRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const link = await links.add({
      projectId: project.id,
      url: "https://example.com",
      title: "Report",
    });

    await expect(
      links.update(link.id, { status: "bogus" as ProjectLinkStatus }),
    ).rejects.toMatchObject({ code: "db_constraint" });
    expect((await links.get(link.id))?.status).toBe("pending");
  }));

  it("detaches a snapshot when its file is deleted", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const files = createFileRepository(ctx);
    const links = createProjectLinkRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const file = await files.add({
      id: ctx.ids(),
      projectId: project.id,
      name: "summary.txt",
      mime: "text/plain",
      size: 10,
      path: `projects/${project.id}/library/summary.txt`,
      kind: "text",
    });
    const link = await links.add({
      projectId: project.id,
      url: "https://example.com",
      title: "Report",
    });

    const attached = await links.update(link.id, {
      snapshotFileId: file.id,
      status: "ready",
    });
    expect(attached.snapshotFileId).toBe(file.id);

    await files.remove(file.id);
    expect((await links.get(link.id))?.snapshotFileId).toBeNull();
  }));

  it("removes links with their project", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const links = createProjectLinkRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    await links.add({
      projectId: project.id,
      url: "https://example.com",
      title: "Report",
    });

    await projects.remove(project.id);
    expect(await links.listByProject(project.id)).toEqual([]);
  }));
});
