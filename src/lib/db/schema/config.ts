/**
 * System Configuration Schema (FR-045, NFR-007)
 *
 * Stores configurable policy values so attendance rules can be updated
 * without redesigning the platform (NFR-007). All policy values that
 * the PRD defers to client-approved policy (AS-006) are stored here.
 *
 * Example config keys:
 * - qr_token_refresh_interval_seconds (default: 15)
 * - qr_token_validity_seconds (default: 30)
 * - session_timeout_minutes (default: 30)
 * - late_arrival_grace_seconds (default: 600)
 * - early_exit_grace_seconds (default: 600)
 *
 * Changes to configuration values are logged in the audit trail (FR-047).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// ── System Config table ────────────────────────────────────────────────
export const systemConfig = pgTable(
  "system_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 100 }).notNull(),
    value: text("value").notNull(),
    description: text("description"),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("system_config_key_idx").on(table.key)]
);
