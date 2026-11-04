import type { Migration } from "../types";

export const messageSupersededMigration: Migration = {
  version: 3,
  name: "keep superseded replies for spend",
  statements: ["ALTER TABLE messages ADD COLUMN superseded INTEGER NOT NULL DEFAULT 0"],
};
