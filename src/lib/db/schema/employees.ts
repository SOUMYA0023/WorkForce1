/**
 * Employee Master Data Schema (FR-006 to FR-009)
 *
 * Stores employee records imported via bulk spreadsheet upload (FR-006)
 * or created individually by authorized administrators (FR-009).
 *
 * Refinements applied:
 * 1. Rich status lifecycle: active, inactive, suspended, terminated, on_leave.
 * 2. Soft deletion: deleted_at, deleted_by.
 * 3. Unique fields: email, phone_number.
 * 4. Prepared reference IDs: department_id, designation_id.
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
import { users } from "./users";

// ── Employee status enum ───────────────────────────────────────────────
export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
  "suspended",
  "terminated",
  "on_leave",
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
    departmentId: uuid("department_id"), // Prepared reference ID for future migration
    designationId: uuid("designation_id"), // Prepared reference ID for future migration
    email: varchar("email", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 50 }),
    status: employeeStatusEnum("status").notNull().default("active"),
    joinedAt: date("joined_at").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, {
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
  (table) => [
    uniqueIndex("employees_employee_code_idx").on(table.employeeCode),
    uniqueIndex("employees_email_idx").on(table.email),
    uniqueIndex("employees_phone_number_idx").on(table.phoneNumber),
    index("employees_department_idx").on(table.department),
    index("employees_designation_idx").on(table.designation),
    index("employees_status_idx").on(table.status),
    index("employees_deleted_at_idx").on(table.deletedAt),
    index("employees_department_status_idx").on(
      table.department,
      table.status
    ),
  ]
);
