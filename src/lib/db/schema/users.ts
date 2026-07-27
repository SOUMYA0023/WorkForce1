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
 * Uses NextAuth database session strategy (ADR §3) for server-side
 * session revocation — JWT sessions can't be revoked, which is
 * unacceptable for access control and fraud prevention (SR-004, FR-004).
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
    employeeId: uuid("employee_id"), // FK to employees, set in relations
    isActive: boolean("is_active").notNull().default(true),
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
// Required by NextAuth's database session strategy (ADR §3).
// These tables enable server-side session management so that deactivated
// or compromised accounts can be revoked immediately (SR-004, FR-004).

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
