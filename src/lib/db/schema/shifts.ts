/**
 * Shift Templates & Assignments Schema (FR-025 to FR-028)
 *
 * Shift templates define working time windows with configurable policy
 * thresholds (grace periods, OT thresholds) per NFR-007. All threshold
 * values are in seconds for consistency with the system's seconds-as-base-unit
 * design (ADR §6, FR-029).
 *
 * shift_assignments is the AUTHORITATIVE SOURCE for which shift an
 * employee is currently on (ADR §9). The current assignment is the row
 * where effective_to IS NULL.
 */

import {
  pgTable,
  uuid,
  varchar,
  time,
  integer,
  boolean,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { users } from "./users";

// ── Shifts table (templates) ───────────────────────────────────────────
export const shifts = pgTable("shifts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  breakDurationSeconds: integer("break_duration_seconds").notNull().default(0),
  lateGraceSeconds: integer("late_grace_seconds").notNull().default(600), // 10 min default
  earlyExitGraceSeconds: integer("early_exit_grace_seconds")
    .notNull()
    .default(600), // 10 min default
  overtimeThresholdSeconds: integer("overtime_threshold_seconds")
    .notNull()
    .default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ── Shift Assignments table ────────────────────────────────────────────
// This is the authoritative source for employee↔shift mapping (ADR §9).
// Current assignment: WHERE employee_id = $1 AND effective_to IS NULL
export const shiftAssignments = pgTable(
  "shift_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"), // null = current assignment
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Optimized for the "current shift" lookup: WHERE effective_to IS NULL
    index("shift_assignments_employee_effective_to_idx").on(
      table.employeeId,
      table.effectiveTo
    ),
    index("shift_assignments_employee_effective_from_idx").on(
      table.employeeId,
      table.effectiveFrom
    ),
    index("shift_assignments_shift_id_idx").on(table.shiftId),
  ]
);
