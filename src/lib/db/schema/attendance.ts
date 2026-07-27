/**
 * Attendance Schema — Tokens, Events & Ledger (FR-010 to FR-024)
 *
 * This file defines the three core attendance tables:
 *
 * 1. attendance_tokens — Short-lived, single-use QR tokens (FR-010–017)
 * 2. attendance_events — Mutable record of check-in/check-out events (FR-018–024)
 * 3. attendance_ledger — Immutable, append-only audit record (FR-023, NFR-003)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CRITICAL: ATOMIC TOKEN CLAIMING (ADR §7)
 * ═══════════════════════════════════════════════════════════════════════
 * Token consumption in Phase 2 MUST use a single atomic UPDATE...RETURNING,
 * NEVER a SELECT followed by an UPDATE. This eliminates the TOCTOU race
 * condition at the gate scanner.
 *
 * Required access pattern:
 *
 *   UPDATE attendance_tokens
 *   SET is_consumed = true, consumed_at = now()
 *   WHERE id = $1 AND is_consumed = false AND expires_at > now()
 *   RETURNING *;
 *
 * Zero rows returned = reject the scan (expired, already used, or invalid).
 * The index on (employee_id, is_consumed, expires_at) supports this query.
 * ═══════════════════════════════════════════════════════════════════════
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  date,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { users } from "./users";
import { shifts } from "./shifts";

// ── Enums ──────────────────────────────────────────────────────────────
export const tokenTypeEnum = pgEnum("token_type", ["check_in", "check_out"]);
export const attendanceEventTypeEnum = pgEnum("attendance_event_type", [
  "check_in",
  "check_out",
]);

// ── Attendance Tokens table ────────────────────────────────────────────
export const attendanceTokens = pgTable(
  "attendance_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    tokenType: tokenTypeEnum("token_type").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(), // FR-017: record token generation time
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }), // FR-017: record validation time
    isConsumed: boolean("is_consumed").notNull().default(false), // FR-016: single-use
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_tokens_token_hash_idx").on(table.tokenHash),
    // Supports the atomic UPDATE...RETURNING query pattern (ADR §7)
    index("attendance_tokens_validation_idx").on(
      table.employeeId,
      table.isConsumed,
      table.expiresAt
    ),
  ]
);

// ── Attendance Events table ────────────────────────────────────────────
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    eventType: attendanceEventTypeEnum("event_type").notNull(),
    eventDate: date("event_date").notNull(),
    eventTimestamp: timestamp("event_timestamp", {
      withTimezone: true,
    }).notNull(), // FR-018/019: precise time
    tokenId: uuid("token_id")
      .notNull()
      .references(() => attendanceTokens.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    validatedBy: uuid("validated_by").references(() => users.id, {
      onDelete: "set null",
    }), // Gate operator
    isCorrected: boolean("is_corrected").notNull().default(false),
    correctionId: uuid("correction_id"), // FK set in relations to avoid circular
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // FR-015: Duplicate prevention — no two check-ins or check-outs on the same day
    // Corrections go through the override workflow (FR-024)
    uniqueIndex("attendance_events_duplicate_prevention_idx").on(
      table.employeeId,
      table.eventType,
      table.eventDate
    ),
    index("attendance_events_employee_date_idx").on(
      table.employeeId,
      table.eventDate
    ),
    index("attendance_events_date_idx").on(table.eventDate),
  ]
);

// ── Attendance Ledger table (IMMUTABLE) ────────────────────────────────
// This table is append-only (SR-012). NO UPDATE or DELETE operations
// are permitted — not even by admins. Corrections create new ledger
// entries linked via the corrections table.
export const attendanceLedger = pgTable(
  "attendance_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attendanceEventId: uuid("attendance_event_id")
      .notNull()
      .references(() => attendanceEvents.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    eventType: attendanceEventTypeEnum("event_type").notNull(),
    eventDate: date("event_date").notNull(),
    eventTimestamp: timestamp("event_timestamp", {
      withTimezone: true,
    }).notNull(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    workedSeconds: integer("worked_seconds"), // Calculated after check-out (FR-020)
    isLate: boolean("is_late").notNull().default(false), // FR-021
    lateSeconds: integer("late_seconds").notNull().default(0),
    isEarlyExit: boolean("is_early_exit").notNull().default(false), // FR-022
    earlyExitSeconds: integer("early_exit_seconds").notNull().default(0),
    recordHash: varchar("record_hash", { length: 255 }).notNull(), // Tamper detection
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NO updatedAt — this table is immutable (SR-012)
  },
  (table) => [
    // Correction #7: Same composite index as attendance_events since Phase 5
    // reporting queries the ledger (the immutable source of truth)
    index("attendance_ledger_employee_date_idx").on(
      table.employeeId,
      table.eventDate
    ),
    index("attendance_ledger_date_idx").on(table.eventDate),
    index("attendance_ledger_event_id_idx").on(table.attendanceEventId),
  ]
);
