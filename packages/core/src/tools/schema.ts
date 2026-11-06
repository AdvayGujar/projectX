import { z } from "zod";

/**
 * Converts a Zod input schema to the JSON Schema a provider expects. `$schema` is a JSON
 * Schema document marker, not a provider tool parameter, so it is removed. Provider-specific
 * keyword filtering happens in the adapter that needs it.
 */
export function toToolParameters(schema: z.ZodType): Record<string, unknown> {
  const parameters = z.toJSONSchema(schema) as unknown as Record<string, unknown>;
  delete parameters.$schema;
  return parameters;
}
