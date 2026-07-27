/**
 * Audit Logs Schema (SR-005, SR-012, FR-047)
 *
 * IMMUTABLE — NO UPDATE OR DELETE OPERATIONS (SR-012):
 * This table is strictly append-only. No admin, super admin, or system
 * process may modify or delete audit log entries. There is intentionally
 * no `updatedAt` column.
 *
 * Covers all five SR-005 audit categories:
 * 1. auth       — Login success/failure (FR-005)
 * 2. attendance — Check-in/check-out events, token validation
 * 3. correction — Attendance corrections and overrides (FR-024)
 * 4. config     — Configuration changes (FR-047)
 * 5. export     — Report and payroll data exports
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// ── Audit category enum ────────────────────────────────────────────────
export const auditCategoryEnum = pgEnum("audit_category", [
  "auth",
  "attendance",
  "correction",
  "config",
  "export",
]);

// ── Audit Logs table ───────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }), // nullable for system-initiated actions
    action: varchar("action", { length: 100 }).notNull(), // e.g., LOGIN_SUCCESS, ATTENDANCE_CHECK_IN
    category: auditCategoryEnum("category").notNull(),
    resourceType: varchar("resource_type", { length: 100 }), // e.g., employee, attendance_event
    resourceId: uuid("resource_id"),
    details: jsonb("details"), // Additional context (flexible schema)
    ipAddress: varchar("ip_address", { length: 45 }), // Supports IPv6
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NO updatedAt — this table is immutable (SR-012)
  },
  (table) => [
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_category_idx").on(table.category),
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_category_created_at_idx").on(
      table.category,
      table.createdAt
    ),
  ]
);
