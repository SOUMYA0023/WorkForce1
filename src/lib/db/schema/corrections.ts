/**
 * Corrections & Overrides Schema (FR-024, RA-003)
 *
 * Implements the authorized correction workflow where attendance records
 * can be modified only by authorized administrators with mandatory reason
 * capture (FR-024) and approval (SR-006).
 *
 * CORRECTIONS-TO-PAYROLL INTERACTION (ADR §8):
 * When a correction is approved for an attendance event whose payroll record
 * is already is_finalized = true:
 * - The system automatically un-finalizes the payroll record and triggers
 *   recalculation for that (employee_id, period_date).
 * - The `payroll_impact` column records `recalculation_triggered`.
 * - Both the un-finalization and recalculation are logged in the audit trail.
 *
 * This maps to RA-005 (payroll disputes due to incorrect rules) — the
 * system self-corrects rather than requiring manual intervention.
 */

import {
  pgTable,
  uuid,
  timestamp,
  text,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { attendanceEvents } from "./attendance";
import { employees } from "./employees";
import { users } from "./users";

// ── Correction type enum ───────────────────────────────────────────────
export const correctionTypeEnum = pgEnum("correction_type", [
  "manual_check_in",
  "manual_check_out",
  "time_adjustment",
  "deletion",
]);

// ── Correction status enum ─────────────────────────────────────────────
export const correctionStatusEnum = pgEnum("correction_status", [
  "pending",
  "approved",
  "rejected",
]);

// ── Payroll impact enum ────────────────────────────────────────────────
export const payrollImpactEnum = pgEnum("payroll_impact", [
  "none",
  "recalculation_triggered",
  "blocked_finalized",
]);

// ── Corrections table ──────────────────────────────────────────────────
export const corrections = pgTable(
  "corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attendanceEventId: uuid("attendance_event_id")
      .notNull()
      .references(() => attendanceEvents.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    correctedBy: uuid("corrected_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }), // SR-006: requires explicit authorization
    correctionType: correctionTypeEnum("correction_type").notNull(),
    originalTimestamp: timestamp("original_timestamp", {
      withTimezone: true,
    }).notNull(),
    correctedTimestamp: timestamp("corrected_timestamp", {
      withTimezone: true,
    }).notNull(),
    reason: text("reason").notNull(), // FR-024: mandatory reason capture
    status: correctionStatusEnum("status").notNull().default("pending"),
    payrollImpact: payrollImpactEnum("payroll_impact")
      .notNull()
      .default("none"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("corrections_event_id_idx").on(table.attendanceEventId),
    index("corrections_employee_status_idx").on(
      table.employeeId,
      table.status
    ),
    index("corrections_corrected_by_idx").on(table.correctedBy),
  ]
);
