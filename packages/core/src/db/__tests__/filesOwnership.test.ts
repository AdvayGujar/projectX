import { describe, expect, it } from "vitest";

import {
  createFileRepository,
  createProjectLinkRepository,
  createProjectRepository,
  createSessionRepository,
} from "../index";
import { addProjectFile, addSessionFile } from "./fileFixtures";
import { withContext } from "./helpers";

describe("file ownership", () => {
  it("keeps session-owned and project-owned files separate", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const files = createFileRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const other = await projects.create({ name: "Elsewhere" });
    const inProject = await sessions.create({ projectId: project.id });
    const standalone = await sessions.create({});

    const first = await addProjectFile(ctx, project.id, { name: "first.pdf" });
    const second = await addProjectFile(ctx, project.id, { name: "second.pdf" });
    const otherProjectFile = await addProjectFile(ctx, other.id, { name: "other.pdf" });
    const sessionFile = await addSessionFile(ctx, inProject.id, { name: "session.pdf" });
    const loose = await addSessionFile(ctx, standalone.id, { name: "loose.pdf" });

    expect((await files.listBySession(inProject.id)).map((file) => file.id)).toEqual([
      sessionFile.id,
    ]);
    expect((await files.listByProject(project.id)).map((file) => file.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect((await files.listByProject(other.id)).map((file) => file.id)).toEqual([
      otherProjectFile.id,
    ]);
    expect((await files.listByProject(project.id)).map((file) => file.id)).not.toContain(
      loose.id,
    );
  }));

  it("rejects a file with two owners or none", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const project = await projects.create({ name: "Reports" });

    await expect(
      addSessionFile(ctx, session.id, { projectId: project.id }),
    ).rejects.toMatchObject({ code: "db_invalid" });

    const files = createFileRepository(ctx);
    const id = ctx.ids();
    await expect(files.add({
      id,
      name: "report.pdf",
      mime: "application/pdf",
      size: 1,
      path: `files/${id}.pdf`,
      kind: "pdf",
    })).rejects.toMatchObject({ code: "db_invalid" });
  }));

  it("removes project files with the project and keeps them when a chat goes", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const files = createFileRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({ projectId: project.id });
    const libraryFile = await addProjectFile(ctx, project.id);
    const sessionFile = await addSessionFile(ctx, session.id);

    await sessions.remove(session.id);

    expect(await files.get(libraryFile.id)).not.toBeNull();
    expect(await files.get(sessionFile.id)).toBeNull();

    await projects.remove(project.id);
    expect(await files.get(libraryFile.id)).toBeNull();
  }));

  it("lists library files without the snapshots that belong to links", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const links = createProjectLinkRepository(ctx);
    const files = createFileRepository(ctx);
    const project = await projects.create({ name: "Reports" });

    const snapshot = await addProjectFile(ctx, project.id, { name: "summary.txt", kind: "text" });
    const link = await links.add({
      projectId: project.id,
      url: "https://example.com/reports",
      title: "example.com",
    });
    await links.update(link.id, { snapshotFileId: snapshot.id, status: "ready" });
    const normal = await addProjectFile(ctx, project.id, { name: "budget.pdf" });

    expect((await files.listLibrary(project.id)).map((file) => file.id)).toEqual([normal.id]);
    expect((await files.listByProject(project.id)).map((file) => file.id)).toEqual([
      normal.id,
      snapshot.id,
    ]);
  }));
});
