/**
 * Users & Roles Schema (UR-001 to UR-005)
 *
 * Implements the five user roles from PRD Section 5.2:
 * - Super Admin: Full system configuration and all records access
 * - Admin: Attendance oversight, employee/shift management, reports
 * - Gate Operator: Attendance scanning and live monitoring only
 * - HR/Payroll: Employee master data, payroll export, reports
 * - Employee: Login, attendance view, QR access, personal history only
 *
 * Account Lockout (Refinement #6):
 * - failed_login_attempts (integer): Tracks consecutive failed login attempts.
 * - locked_until (timestamp): Locks the account temporarily after 5 failed attempts.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";

// ── Role enum ──────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "gate_operator",
  "hr_payroll",
  "employee",
]);

// ── Users table ────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("employee"),
    employeeId: uuid("employee_id"), // FK to employees
    isActive: boolean("is_active").notNull().default(true),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_role_idx").on(table.role),
    index("users_employee_id_idx").on(table.employeeId),
  ]
);

// ── NextAuth Database Session Tables ───────────────────────────────────
export const sessions = pgTable(
  "sessions",
  {
    sessionToken: varchar("session_token", { length: 255 })
      .notNull()
      .primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    idToken: text("id_token"),
    sessionState: varchar("session_state", { length: 255 }),
  },
  (table) => [
    primaryKey({
      columns: [table.provider, table.providerAccountId],
    }),
  ]
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.identifier, table.token],
    }),
  ]
);
