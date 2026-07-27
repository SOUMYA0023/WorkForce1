/**
 * Schema Barrel Export
 *
 * Central export point for all Drizzle schema definitions.
 * Import from this file when you need schema types or table references.
 */

// Users & roles (UR-001 to UR-005)
export {
  users,
  sessions,
  accounts,
  verificationTokens,
  userRoleEnum,
} from "./users";

// Employee master data (FR-006 to FR-009)
export { employees, employeeStatusEnum } from "./employees";

// Shift templates & assignments (FR-025 to FR-028)
export { shifts, shiftAssignments } from "./shifts";

// Attendance tokens, events & ledger (FR-010 to FR-024)
export {
  attendanceTokens,
  attendanceEvents,
  attendanceLedger,
  tokenTypeEnum,
  attendanceEventTypeEnum,
} from "./attendance";

// Payroll & overtime records (FR-029 to FR-034)
export { payrollRecords } from "./payroll";

// Audit logs (SR-005, SR-012, FR-047)
export { auditLogs, auditCategoryEnum } from "./audit";

// Corrections & overrides (FR-024, RA-003)
export {
  corrections,
  correctionTypeEnum,
  correctionStatusEnum,
  payrollImpactEnum,
} from "./corrections";

// System configuration (FR-045, NFR-007)
export { systemConfig } from "./config";
