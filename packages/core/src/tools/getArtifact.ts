import { z } from "zod";

import { createArtifactRepository, isArtifactInScope } from "../db";
import type { DbContext } from "../db";
import { defineTool } from "./executor";
import { resolveToolScope, throwIfAborted } from "./scope";
import type { ToolDefinition } from "./types";

const input = z.object({
  artifactId: z.string().min(1).describe("The artifact id from the project artifact catalog."),
  version: z.number().int().min(1).optional().describe(
    "Version to read. Defaults to the current version.",
  ),
});

/** Reads the immutable spec JSON for an artifact the chat is allowed to see. */
export function getArtifactTool(ctx: DbContext): ToolDefinition {
  const artifacts = createArtifactRepository(ctx);

  return defineTool({
    name: "get_artifact",
    description:
      "Read the JSON spec of a deck, sheet, or document artifact at its current or a requested version. Use it when an answer depends on the artifact's actual content.",
    role: "read",
    input,

    async execute(value, context) {
      const scope = await resolveToolScope(ctx, context);
      throwIfAborted(context.signal);
      const artifact = await artifacts.get(value.artifactId);
      if (!artifact || !isArtifactInScope(artifact, scope)) {
        return {
          content: "That artifact is not in this chat or project.",
          display: "artifact not found",
          isError: true,
        };
      }

      const version = value.version ?? artifact.currentVersion;
      const stored = await artifacts.getVersion(artifact.id, version);
      throwIfAborted(context.signal);
      if (!stored) {
        return {
          content: `${artifact.title} does not have version ${version}.`,
          display: `${artifact.title} · v${version} missing`,
          isError: true,
        };
      }

      let spec: unknown;
      try {
        spec = JSON.parse(stored.specJson);
      } catch {
        return {
          content: `${artifact.title} has a spec that could not be read.`,
          display: `${artifact.title} · invalid spec`,
          isError: true,
        };
      }

      return {
        content: `Artifact: ${artifact.title} (${artifact.kind}, v${stored.version})\n\n${JSON.stringify(spec, null, 2)}`,
        display: `${artifact.title} · v${stored.version}`,
      };
    },
  });
}
