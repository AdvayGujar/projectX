import type { Migration } from "../types";

export const messageEffortMigration: Migration = {
  version: 2,
  name: "store reasoning effort per message",
  statements: ["ALTER TABLE messages ADD COLUMN effort TEXT"],
};
