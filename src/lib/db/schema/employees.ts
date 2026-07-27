/**
 * Employee Master Data Schema (FR-006 to FR-009)
 *
 * Stores employee records imported via bulk spreadsheet upload (FR-006)
 * or created individually by authorized administrators (FR-009).
 *
 * SHIFT SOURCE OF TRUTH (ADR §9):
 * There is intentionally NO `current_shift_id` column on this table.
 * An employee's current shift is derived exclusively from the
 * `shift_assignments` table (the authoritative source):
 *
 *   SELECT sa.shift_id FROM shift_assignments sa
 *   WHERE sa.employee_id = $1 AND sa.effective_to IS NULL
 *   ORDER BY sa.effective_from DESC LIMIT 1;
 *
 * This avoids dual-write drift between a denormalized column and
 * the assignment history. A helper function `getCurrentShift(employeeId)`
 * encapsulates this query (see src/lib/attendance/validation.ts).
 */

import {
  pgTable,
  uuid,
  varchar,
  date,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Employee status enum ───────────────────────────────────────────────
export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
]);

// ── Employees table ────────────────────────────────────────────────────
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeCode: varchar("employee_code", { length: 50 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    department: varchar("department", { length: 100 }).notNull(),
    designation: varchar("designation", { length: 100 }).notNull(),
    status: employeeStatusEnum("status").notNull().default("active"),
    joinedAt: date("joined_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("employees_employee_code_idx").on(table.employeeCode),
    index("employees_department_idx").on(table.department),
    index("employees_status_idx").on(table.status),
    index("employees_department_status_idx").on(
      table.department,
      table.status
    ),
  ]
);
