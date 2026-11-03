import { z } from "zod";

import { AppError } from "../../errors";
import type { ModelInfo, Protocol } from "../../providers";
import type { DbContext, SqlDatabase, SqlValue } from "../types";
import { toDbError } from "./errors";

interface ProviderRow {
  id: string;
  preset_id: string;
  label: string;
  protocol: string;
  base_url: string;
  key_ref: string;
  enabled: number;
  created_at: number;
}

interface ModelRow {
  json: string;
}

const PROTOCOLS: readonly Protocol[] = ["openai-chat", "openai-responses", "anthropic", "google"];

const modelSchema = z.object({
  id: z.string(),
  label: z.string(),
  providerId: z.string(),
  protocol: z.enum(["openai-chat", "openai-responses", "anthropic", "google"]),
  contextWindow: z.number(),
  maxOutput: z.number(),
  capabilities: z.object({
    tools: z.boolean(),
    vision: z.boolean(),
    reasoning: z.boolean(),
  }),
  pricing: z
    .object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number().optional(),
      cacheWrite: z.number().optional(),
    })
    .optional(),
  endpoint: z.string().optional(),
});

export interface ProviderRecord {
  readonly id: string;
  readonly presetId: string;
  readonly label: string;
  readonly protocol: Protocol;
  readonly baseUrl: string;
  readonly keyRef: string;
  readonly enabled: boolean;
  readonly createdAt: number;
}

export interface AddProviderInput {
  readonly presetId: string;
  readonly label: string;
  readonly protocol: Protocol;
  readonly baseUrl: string;
  readonly keyRef: string;
}

export interface ProviderRepository {
  add(input: AddProviderInput): Promise<ProviderRecord>;
  get(id: string): Promise<ProviderRecord | null>;
  list(): Promise<ProviderRecord[]>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  saveModels(providerId: string, models: readonly ModelInfo[]): Promise<void>;
  listModels(providerId: string): Promise<ModelInfo[]>;
}

/**
 * Providers hold a key *reference* only. The secret itself lives in the keychain and is
 * never written to SQLite (project rule 4).
 */
export function createProviderRepository({ db, ids, now }: DbContext): ProviderRepository {
  return {
    async add(input: AddProviderInput): Promise<ProviderRecord> {
      const id = ids();
      const label = input.label.trim();
      if (label.length === 0) {
        throw new AppError("db_invalid", "Provider label is required", {
          userMessage: "Give the provider a name.",
        });
      }
      try {
        await db.execute(
          `INSERT INTO providers (id, preset_id, label, protocol, base_url, key_ref, enabled, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [id, input.presetId, label, input.protocol, input.baseUrl, input.keyRef, now()],
        );
      } catch (error) {
        throw toDbError(error, "Could not save the provider.");
      }
      const created = await getProvider(db, id);
      if (!created) {
        throw new AppError("db_not_found", `Provider ${id} not found after insert`);
      }
      return created;
    },

    async get(id: string): Promise<ProviderRecord | null> {
      return getProvider(db, id);
    },

    async list(): Promise<ProviderRecord[]> {
      const result = await db.execute("SELECT * FROM providers ORDER BY created_at ASC");
      return result.rows.map((row) => toProvider(row as unknown as ProviderRow));
    },

    async setEnabled(id: string, enabled: boolean): Promise<void> {
      await assertProviderExists(db, id);
      await db.execute("UPDATE providers SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, id]);
    },

    async remove(id: string): Promise<void> {
      await assertProviderExists(db, id);
      // models_cache has no foreign key, so clear it explicitly in the same transaction.
      await db.executeBatch([
        ["DELETE FROM models_cache WHERE provider_id = ?", [id]],
        ["DELETE FROM providers WHERE id = ?", [id]],
      ]);
    },

    async saveModels(providerId: string, models: readonly ModelInfo[]): Promise<void> {
      const fetchedAt = now();
      const commands: Array<[string, SqlValue[]]> = [
        ["DELETE FROM models_cache WHERE provider_id = ?", [providerId]],
      ];
      for (const model of models) {
        commands.push([
          `INSERT INTO models_cache (provider_id, model_id, json, fetched_at) VALUES (?, ?, ?, ?)`,
          [providerId, model.id, JSON.stringify(model), fetchedAt],
        ]);
      }
      await db.executeBatch(commands);
    },

    async listModels(providerId: string): Promise<ModelInfo[]> {
      const result = await db.execute(
        "SELECT json FROM models_cache WHERE provider_id = ? ORDER BY model_id ASC",
        [providerId],
      );
      const models: ModelInfo[] = [];
      for (const row of result.rows as unknown as ModelRow[]) {
        const parsed = modelSchema.safeParse(safeJson(row.json));
        if (parsed.success) {
          models.push(parsed.data);
        }
      }
      return models;
    },
  };
}

async function getProvider(db: SqlDatabase, id: string): Promise<ProviderRecord | null> {
  const result = await db.execute("SELECT * FROM providers WHERE id = ?", [id]);
  const row = result.rows[0] as unknown as ProviderRow | undefined;
  return row ? toProvider(row) : null;
}

async function assertProviderExists(db: SqlDatabase, id: string): Promise<void> {
  const result = await db.execute("SELECT id FROM providers WHERE id = ?", [id]);
  if (result.rows.length === 0) {
    throw new AppError("db_not_found", `Provider ${id} not found`, {
      userMessage: "That provider no longer exists.",
    });
  }
}

function toProvider(row: ProviderRow): ProviderRecord {
  const protocol = row.protocol;
  if (!isProtocol(protocol)) {
    throw new AppError("db_invalid", `Unknown provider protocol: ${protocol}`);
  }
  return {
    id: row.id,
    presetId: row.preset_id,
    label: row.label,
    protocol,
    baseUrl: row.base_url,
    keyRef: row.key_ref,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

function isProtocol(value: string): value is Protocol {
  return (PROTOCOLS as readonly string[]).includes(value);
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
