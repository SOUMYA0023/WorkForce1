/**
 * Audit Logs Schema (SR-005, SR-012, FR-047)
 *
 * IMMUTABLE — NO UPDATE OR DELETE OPERATIONS (SR-012):
 * This table is strictly append-only.
 *
 * Standardized audit categories:
 * - AUTH       — Login success/failure, account lockout, logout
 * - EMPLOYEE   — Create, update, soft delete, status change, bulk import
 * - SHIFT      — Shift templates, shift assignment changes
 * - PAYROLL    — Payroll computation, recalculation, finalization
 * - ATTENDANCE — Check-in/check-out, QR generation/validation
 * - CORRECTION — Attendance correction submissions, approvals, rejections
 * - CONFIG     — System configuration changes, policy threshold updates
 * - SYSTEM     — System administration & maintenance operations
 * - EXPORT     — Spreadsheet, report, and payroll data exports
 * - SECURITY   — Segregation of duties violations, privilege escalation attempts, access policy breaches
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

// ── Standardized Audit Category Enum ───────────────────────────────────
export const auditCategoryEnum = pgEnum("audit_category", [
  "AUTH",
  "EMPLOYEE",
  "SHIFT",
  "PAYROLL",
  "ATTENDANCE",
  "CORRECTION",
  "CONFIG",
  "SYSTEM",
  "EXPORT",
  "SECURITY",
]);

// ── Audit Logs Table ───────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(), // e.g. LOGIN_SUCCESS, EMPLOYEE_CREATED
    category: auditCategoryEnum("category").notNull(),
    resourceType: varchar("resource_type", { length: 100 }), // e.g. employee, user, shift
    resourceId: uuid("resource_id"),
    details: jsonb("details"), // Flexible metadata: ip, userAgent, browser, os, requestId, sessionId, failureReason
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Immutable — no updatedAt column
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
