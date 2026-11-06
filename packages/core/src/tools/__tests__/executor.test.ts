import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError } from "../../errors";
import {
  capToolOutput,
  createToolExecutor,
  defineTool,
  MAX_TOOL_OUTPUT_CHARS,
  toToolParameters,
} from "../index";

const context = { sessionId: "session-1" };

describe("tool schema conversion", () => {
  it("removes the JSON Schema marker and keeps required fields", () => {
    const parameters = toToolParameters(
      z.object({
        fileId: z.string().min(1).describe("The file id."),
        limit: z.number().int().min(1).optional(),
      }),
    );

    expect(parameters.$schema).toBeUndefined();
    expect(parameters.type).toBe("object");
    expect(parameters.required).toEqual(["fileId"]);
    expect(parameters.additionalProperties).toBe(false);
  });
});

describe("tool executor", () => {
  it("exposes schemas and roles", () => {
    const executor = createToolExecutor([
      defineTool({
        name: "read_document",
        description: "Read a file.",
        role: "read",
        input: z.object({ fileId: z.string() }),
        async execute() {
          return { content: "ok", display: "report.pdf" };
        },
      }),
    ]);

    expect(executor.schemas.map((schema) => schema.name)).toEqual(["read_document"]);
    expect(executor.roleOf("read_document")).toBe("read");
    expect(executor.roleOf("missing")).toBeUndefined();
  });

  it("returns a structured error for invalid arguments", async () => {
    const executor = createToolExecutor([
      defineTool({
        name: "read_document",
        description: "Read a file.",
        role: "read",
        input: z.object({ fileId: z.string().min(1) }),
        async execute() {
          return { content: "unreachable", display: "never" };
        },
      }),
    ]);

    const result = await executor.execute(
      { id: "call-1", name: "read_document", arguments: {} },
      context,
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("fileId");
    expect(result.display).toBe("invalid arguments");
  });

  it("turns thrown errors and AppErrors into tool results", async () => {
    const executor = createToolExecutor([
      defineTool({
        name: "read_document",
        description: "Read a file.",
        role: "read",
        input: z.object({}),
        async execute() {
          throw new AppError("file_not_found", "missing", {
            userMessage: "That file is missing.",
          });
        },
      }),
    ]);

    const result = await executor.execute(
      { id: "call-1", name: "read_document", arguments: {} },
      context,
    );

    expect(result.isError).toBe(true);
    expect(result.content).toBe("That file is missing.");
    expect(result.display).toBe("failed");
  });

  it("caps long output before it reaches the model", async () => {
    const executor = createToolExecutor([
      defineTool({
        name: "read_document",
        description: "Read a file.",
        role: "read",
        input: z.object({}),
        async execute() {
          return { content: "x".repeat(MAX_TOOL_OUTPUT_CHARS + 500), display: "big" };
        },
      }),
    ]);

    const result = await executor.execute(
      { id: "call-1", name: "read_document", arguments: {} },
      context,
    );

    expect(result.content.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS);
    expect(result.content).toContain("[Output truncated");
  });
});

describe("capToolOutput", () => {
  it("leaves short text unchanged", () => {
    expect(capToolOutput("short")).toBe("short");
  });
});
