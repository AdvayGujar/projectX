import { describe, expect, it } from "vitest";

import { assertSafeRelativePath, joinUnderRoot } from "../../index";
import {
  extensionForMime,
  extensionOf,
  fileRelativePath,
  safeDisplayName,
  sessionFilesDirectory,
} from "../index";

describe("document paths", () => {
  it("builds a session-scoped path from the file id and extension", () => {
    expect(sessionFilesDirectory("session-1")).toBe("sessions/session-1/files");
    expect(fileRelativePath("session-1", "file-1", "Report.PDF", "application/pdf")).toBe(
      "sessions/session-1/files/file-1.pdf",
    );
    expect(fileRelativePath("session-1", "file-1", "notes.md", "text/markdown")).toBe(
      "sessions/session-1/files/file-1.md",
    );
    expect(fileRelativePath("session-1", "file-1", "README", "text/plain")).toBe(
      "sessions/session-1/files/file-1.txt",
    );
  });

  it("prefers the MIME extension over a misleading name", () => {
    expect(fileRelativePath("s", "f", "report.bin", "application/pdf")).toBe(
      "sessions/s/files/f.pdf",
    );
    expect(fileRelativePath("s", "f", "photo.jpeg", "image/png")).toBe(
      "sessions/s/files/f.png",
    );
  });

  it("rejects paths that could escape the sandbox", () => {
    for (const path of [
      "",
      "/absolute/file.pdf",
      "../file.pdf",
      "sessions/../../file.pdf",
      "sessions//files/file.pdf",
      "sessions/./files/file.pdf",
      "sessions\\files\\file.pdf",
      "sessions/s/files/../file.pdf",
      "sessions/s/files/.hidden",
      "sessions/s/files/file\u0000.pdf",
    ]) {
      expect(() => assertSafeRelativePath(path)).toThrow();
    }
  });

  it("rejects unsafe session and file ids", () => {
    expect(() => sessionFilesDirectory("a/b")).toThrow();
    expect(() => sessionFilesDirectory("..")).toThrow();
    expect(() => fileRelativePath("../session", "file", "a.pdf", "application/pdf")).toThrow();
    expect(() => fileRelativePath("session", "../../file", "a.pdf", "application/pdf")).toThrow();
  });

  it("joins under a root without doubling the separator", () => {
    expect(joinUnderRoot("file:///documents", "sessions/s/files/f.pdf")).toBe(
      "file:///documents/sessions/s/files/f.pdf",
    );
    expect(joinUnderRoot("file:///documents/", "sessions/s/files/f.pdf")).toBe(
      "file:///documents/sessions/s/files/f.pdf",
    );
  });

  it("normalises display names and extensions", () => {
    expect(safeDisplayName("  report.pdf  ")).toBe("report.pdf");
    expect(safeDisplayName("bad\u0000name")).toBe("badname");
    expect(safeDisplayName("bad\u202Ename")).toBe("badname");
    expect(safeDisplayName("   ")).toBe("Untitled file");
    expect(Array.from(safeDisplayName("a".repeat(200)))).toHaveLength(160);
    expect(extensionOf("report.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf(".hidden")).toBe("");
    expect(extensionOf("no-extension")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("image/jpeg; charset=binary")).toBe("jpg");
    expect(extensionForMime("application/octet-stream")).toBe("");
  });
});
