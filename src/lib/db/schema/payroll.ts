/**
 * Payroll & Overtime Records Schema (FR-029 to FR-034)
 *
 * TIME-BASED ONLY (ADR §6):
 * This table stores only time-based values (seconds). There are intentionally
 * NO currency columns (hourly_rate, overtime_amount, deduction_amount).
 * The PRD (Section 8.3, FR-029–034) specifies time-based outputs only —
 * HR/Payroll's downstream system is responsible for applying currency rates.
 *
 * All duration fields store exact seconds with no rounding (PW-004, FR-034).
 * Values are always reconstructable from the raw timestamps (PW-005).
 *
 * CORRECTIONS INTERACTION (ADR §8):
 * When a correction is approved for an attendance event whose payroll record
 * has is_finalized = true, the system automatically sets is_finalized = false
 * and re-runs the payroll calculation for that (employee_id, period_date).
 * Both the un-finalization and recalculation are logged in the audit trail.
 */

import {
  pgTable,
  uuid,
  date,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { shifts } from "./shifts";

// ── Payroll Records table ──────────────────────────────────────────────
export const payrollRecords = pgTable(
  "payroll_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    periodDate: date("period_date").notNull(), // The specific work date
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    checkInTimestamp: timestamp("check_in_timestamp", {
      withTimezone: true,
    }).notNull(),
    checkOutTimestamp: timestamp("check_out_timestamp", {
      withTimezone: true,
    }).notNull(),

    // All durations in seconds — base unit per FR-029
    scheduledSeconds: integer("scheduled_seconds").notNull(), // Expected shift duration
    actualWorkedSeconds: integer("actual_worked_seconds").notNull(), // Raw worked time (PW-001)
    breakSeconds: integer("break_seconds").notNull().default(0), // Break deducted
    netWorkedSeconds: integer("net_worked_seconds").notNull(), // After break deduction
    overtimeSeconds: integer("overtime_seconds").notNull().default(0), // Beyond shift (PW-002)
    undertimeSeconds: integer("undertime_seconds").notNull().default(0), // Short of shift (PW-003)
    lateArrivalSeconds: integer("late_arrival_seconds").notNull().default(0),
    earlyExitSeconds: integer("early_exit_seconds").notNull().default(0),

    isFinalized: boolean("is_finalized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One payroll record per employee per date
    uniqueIndex("payroll_records_employee_date_idx").on(
      table.employeeId,
      table.periodDate
    ),
    index("payroll_records_period_date_idx").on(table.periodDate),
  ]
);
