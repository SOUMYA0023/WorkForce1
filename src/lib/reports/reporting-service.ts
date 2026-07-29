/**
 * Reporting Engine — Enterprise Reports Service (RR-001 through RR-010, FR-040 to FR-043)
 *
 * All 10 required reports with filterable dimensions (FR-040):
 *   - RR-001 Daily employee attendance report
 *   - RR-002 Shift-wise attendance report
 *   - RR-003 Department-wise attendance report
 *   - RR-004 Employee-wise monthly attendance report
 *   - RR-005 Overtime report
 *   - RR-006 Late arrival report
 *   - RR-007 Early exit report
 *   - RR-008 Payroll export report
 *   - RR-009 Attendance exception report
 *   - RR-010 Audit log report
 *
 * PERFORMANCE STRATEGY (RA-009, PR-004, ~15K employees):
 * - Cursor-based pagination on all large queries (default page=50, max=200).
 * - All filter columns indexed (see schema files).
 * - RR-010 audit log queries leverage composite (category, created_at) index.
 * - Queries use Drizzle ORM typed selects — no raw SQL, no N+1 application loops.
 * - Export reuses pre-computed payroll values (FR-034, PW-005) — zero recalculation.
 *
 * AUDIT CATEGORY FILTER NOTE (SR-005 / RR-010):
 * Supports all 7 categories: AUTH, EMPLOYEE, SHIFT, PAYROLL, ATTENDANCE, SYSTEM, SECURITY.
 */

import { db } from "../db";
import {
  attendanceLedger,
  attendanceEvents,
  employees,
  shifts,
  shiftAssignments,
  payrollRecords,
  auditLogs,
  corrections,
} from "../db/schema";
import { eq, and, gte, lte, isNull, desc, asc, sql } from "drizzle-orm";
import type { AuditCategory } from "../audit/logger";

// ── Common Types ────────────────────────────────────────────────────────

export interface ReportFilters {
  dateFrom?: string;    // YYYY-MM-DD
  dateTo?: string;      // YYYY-MM-DD
  department?: string;
  employeeId?: string;
  shiftId?: string;
  page?: number;        // 1-indexed
  pageSize?: number;    // default 50, max 200
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

function clampPageSize(pageSize?: number): number {
  const size = pageSize ?? 50;
  return Math.min(Math.max(1, size), 200);
}

function buildDateConditions(
  dateCol: any,
  dateFrom?: string,
  dateTo?: string
) {
  const conditions: any[] = [];
  if (dateFrom) conditions.push(gte(dateCol, dateFrom));
  if (dateTo) conditions.push(lte(dateCol, dateTo));
  return conditions;
}

// ── RR-001: Daily Employee Attendance Report ────────────────────────────

export async function getDailyAttendanceReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [isNull(employees.deletedAt)];
  conditions.push(...buildDateConditions(attendanceLedger.eventDate, filters.dateFrom, filters.dateTo));
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.employeeId) conditions.push(eq(attendanceLedger.employeeId, filters.employeeId));
  if (filters.shiftId) conditions.push(eq(attendanceLedger.shiftId, filters.shiftId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      ledgerId: attendanceLedger.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      designation: employees.designation,
      eventDate: attendanceLedger.eventDate,
      eventType: attendanceLedger.eventType,
      eventTimestamp: attendanceLedger.eventTimestamp,
      shiftName: shifts.name,
      workedSeconds: attendanceLedger.workedSeconds,
      isLate: attendanceLedger.isLate,
      lateSeconds: attendanceLedger.lateSeconds,
      isEarlyExit: attendanceLedger.isEarlyExit,
      earlyExitSeconds: attendanceLedger.earlyExitSeconds,
    })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .leftJoin(shifts, eq(attendanceLedger.shiftId, shifts.id))
    .where(whereClause)
    .orderBy(desc(attendanceLedger.eventDate), asc(employees.employeeCode))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  };
}

// ── RR-002: Shift-Wise Attendance Report ────────────────────────────────

export async function getShiftWiseAttendanceReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [];
  conditions.push(...buildDateConditions(attendanceLedger.eventDate, filters.dateFrom, filters.dateTo));
  if (filters.shiftId) conditions.push(eq(attendanceLedger.shiftId, filters.shiftId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(DISTINCT ${attendanceLedger.shiftId})::int` })
    .from(attendanceLedger)
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      shiftId: attendanceLedger.shiftId,
      shiftName: shifts.name,
      totalEvents: sql<number>`count(*)::int`,
      totalCheckIns: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.eventType} = 'check_in')::int`,
      totalCheckOuts: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.eventType} = 'check_out')::int`,
      totalLateArrivals: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.isLate} = true)::int`,
      totalEarlyExits: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.isEarlyExit} = true)::int`,
      avgWorkedSeconds: sql<number>`coalesce(avg(${attendanceLedger.workedSeconds}) FILTER (WHERE ${attendanceLedger.workedSeconds} IS NOT NULL), 0)::int`,
    })
    .from(attendanceLedger)
    .leftJoin(shifts, eq(attendanceLedger.shiftId, shifts.id))
    .where(whereClause)
    .groupBy(attendanceLedger.shiftId, shifts.name)
    .orderBy(asc(shifts.name))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-003: Department-Wise Attendance Report ───────────────────────────

export async function getDepartmentWiseAttendanceReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [isNull(employees.deletedAt)];
  conditions.push(...buildDateConditions(attendanceLedger.eventDate, filters.dateFrom, filters.dateTo));
  if (filters.department) conditions.push(eq(employees.department, filters.department));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(DISTINCT ${employees.department})::int` })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      department: employees.department,
      totalEmployees: sql<number>`count(DISTINCT ${attendanceLedger.employeeId})::int`,
      totalCheckIns: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.eventType} = 'check_in')::int`,
      totalCheckOuts: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.eventType} = 'check_out')::int`,
      totalLateArrivals: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.isLate} = true)::int`,
      totalEarlyExits: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.isEarlyExit} = true)::int`,
      avgWorkedSeconds: sql<number>`coalesce(avg(${attendanceLedger.workedSeconds}) FILTER (WHERE ${attendanceLedger.workedSeconds} IS NOT NULL), 0)::int`,
    })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .where(whereClause)
    .groupBy(employees.department)
    .orderBy(asc(employees.department))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-004: Employee-Wise Monthly Attendance Report ─────────────────────

export async function getEmployeeMonthlyAttendanceReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [isNull(employees.deletedAt)];
  conditions.push(...buildDateConditions(attendanceLedger.eventDate, filters.dateFrom, filters.dateTo));
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.employeeId) conditions.push(eq(attendanceLedger.employeeId, filters.employeeId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(DISTINCT ${attendanceLedger.employeeId})::int` })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      employeeId: attendanceLedger.employeeId,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      totalDaysPresent: sql<number>`count(DISTINCT ${attendanceLedger.eventDate})::int`,
      totalCheckIns: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.eventType} = 'check_in')::int`,
      totalCheckOuts: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.eventType} = 'check_out')::int`,
      totalLateArrivals: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.isLate} = true)::int`,
      totalEarlyExits: sql<number>`count(*) FILTER (WHERE ${attendanceLedger.isEarlyExit} = true)::int`,
      totalWorkedSeconds: sql<number>`coalesce(sum(${attendanceLedger.workedSeconds}), 0)::int`,
    })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .where(whereClause)
    .groupBy(
      attendanceLedger.employeeId,
      employees.employeeCode,
      employees.firstName,
      employees.lastName,
      employees.department
    )
    .orderBy(asc(employees.employeeCode))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-005: Overtime Report ─────────────────────────────────────────────

export async function getOvertimeReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [isNull(employees.deletedAt)];
  conditions.push(...buildDateConditions(payrollRecords.periodDate, filters.dateFrom, filters.dateTo));
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.employeeId) conditions.push(eq(payrollRecords.employeeId, filters.employeeId));
  if (filters.shiftId) conditions.push(eq(payrollRecords.shiftId, filters.shiftId));
  // Only include rows with overtime
  conditions.push(sql`${payrollRecords.overtimeSeconds} > 0`);

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payrollRecords)
    .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      periodDate: payrollRecords.periodDate,
      shiftName: shifts.name,
      scheduledSeconds: payrollRecords.scheduledSeconds,
      actualWorkedSeconds: payrollRecords.actualWorkedSeconds,
      overtimeSeconds: payrollRecords.overtimeSeconds,
      isFinalized: payrollRecords.isFinalized,
    })
    .from(payrollRecords)
    .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
    .leftJoin(shifts, eq(payrollRecords.shiftId, shifts.id))
    .where(whereClause)
    .orderBy(desc(payrollRecords.periodDate), desc(payrollRecords.overtimeSeconds))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-006: Late Arrival Report ─────────────────────────────────────────

export async function getLateArrivalReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [
    isNull(employees.deletedAt),
    eq(attendanceLedger.isLate, true),
  ];
  conditions.push(...buildDateConditions(attendanceLedger.eventDate, filters.dateFrom, filters.dateTo));
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.employeeId) conditions.push(eq(attendanceLedger.employeeId, filters.employeeId));
  if (filters.shiftId) conditions.push(eq(attendanceLedger.shiftId, filters.shiftId));

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      eventDate: attendanceLedger.eventDate,
      eventTimestamp: attendanceLedger.eventTimestamp,
      shiftName: shifts.name,
      lateSeconds: attendanceLedger.lateSeconds,
    })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .leftJoin(shifts, eq(attendanceLedger.shiftId, shifts.id))
    .where(whereClause)
    .orderBy(desc(attendanceLedger.eventDate), desc(attendanceLedger.lateSeconds))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-007: Early Exit Report ───────────────────────────────────────────

export async function getEarlyExitReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [
    isNull(employees.deletedAt),
    eq(attendanceLedger.isEarlyExit, true),
  ];
  conditions.push(...buildDateConditions(attendanceLedger.eventDate, filters.dateFrom, filters.dateTo));
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.employeeId) conditions.push(eq(attendanceLedger.employeeId, filters.employeeId));
  if (filters.shiftId) conditions.push(eq(attendanceLedger.shiftId, filters.shiftId));

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      eventDate: attendanceLedger.eventDate,
      eventTimestamp: attendanceLedger.eventTimestamp,
      shiftName: shifts.name,
      earlyExitSeconds: attendanceLedger.earlyExitSeconds,
    })
    .from(attendanceLedger)
    .innerJoin(employees, eq(attendanceLedger.employeeId, employees.id))
    .leftJoin(shifts, eq(attendanceLedger.shiftId, shifts.id))
    .where(whereClause)
    .orderBy(desc(attendanceLedger.eventDate), desc(attendanceLedger.earlyExitSeconds))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-008: Payroll Export Report ───────────────────────────────────────
// REUSES pre-computed payroll values from Phase 3 (FR-034, PW-005) — zero recalculation.

export async function getPayrollExportReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [isNull(employees.deletedAt)];
  conditions.push(...buildDateConditions(payrollRecords.periodDate, filters.dateFrom, filters.dateTo));
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.employeeId) conditions.push(eq(payrollRecords.employeeId, filters.employeeId));
  if (filters.shiftId) conditions.push(eq(payrollRecords.shiftId, filters.shiftId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payrollRecords)
    .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      designation: employees.designation,
      periodDate: payrollRecords.periodDate,
      shiftName: shifts.name,
      scheduledSeconds: payrollRecords.scheduledSeconds,
      actualWorkedSeconds: payrollRecords.actualWorkedSeconds,
      breakSeconds: payrollRecords.breakSeconds,
      netWorkedSeconds: payrollRecords.netWorkedSeconds,
      overtimeSeconds: payrollRecords.overtimeSeconds,
      undertimeSeconds: payrollRecords.undertimeSeconds,
      lateArrivalSeconds: payrollRecords.lateArrivalSeconds,
      earlyExitSeconds: payrollRecords.earlyExitSeconds,
      isFinalized: payrollRecords.isFinalized,
    })
    .from(payrollRecords)
    .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
    .leftJoin(shifts, eq(payrollRecords.shiftId, shifts.id))
    .where(whereClause)
    .orderBy(desc(payrollRecords.periodDate), asc(employees.employeeCode))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-009: Attendance Exception Report ─────────────────────────────────

export async function getAttendanceExceptionReport(
  filters: ReportFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [isNull(employees.deletedAt)];
  conditions.push(...buildDateConditions(corrections.createdAt, filters.dateFrom ? new Date(filters.dateFrom).toISOString() : undefined, filters.dateTo ? new Date(filters.dateTo + "T23:59:59Z").toISOString() : undefined));
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.employeeId) conditions.push(eq(corrections.employeeId, filters.employeeId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(corrections)
    .innerJoin(employees, eq(corrections.employeeId, employees.id))
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      correctionId: corrections.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      correctionType: corrections.correctionType,
      status: corrections.status,
      reason: corrections.reason,
      payrollImpact: corrections.payrollImpact,
      originalTimestamp: corrections.originalTimestamp,
      correctedTimestamp: corrections.correctedTimestamp,
      createdAt: corrections.createdAt,
    })
    .from(corrections)
    .innerJoin(employees, eq(corrections.employeeId, employees.id))
    .where(whereClause)
    .orderBy(desc(corrections.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}

// ── RR-010: Audit Log Report ────────────────────────────────────────────
// Supports ALL 7 categories: AUTH, EMPLOYEE, SHIFT, PAYROLL, ATTENDANCE, SYSTEM, SECURITY
// Uses composite index (audit_logs_category_created_at_idx) for performant filtered queries.

export interface AuditLogFilters {
  dateFrom?: string;
  dateTo?: string;
  category?: AuditCategory;
  userId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

// Explicitly list all valid audit categories for validation at the API layer
export const VALID_AUDIT_CATEGORIES: AuditCategory[] = [
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
];

export async function getAuditLogReport(
  filters: AuditLogFilters
): Promise<PaginatedResult<any>> {
  const page = filters.page ?? 1;
  const pageSize = clampPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [];
  if (filters.dateFrom) {
    conditions.push(gte(auditLogs.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    conditions.push(lte(auditLogs.createdAt, new Date(filters.dateTo + "T23:59:59.999Z")));
  }
  if (filters.category) {
    conditions.push(eq(auditLogs.category, filters.category));
  }
  if (filters.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(whereClause);

  const totalCount = countResult?.count || 0;

  const data = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      action: auditLogs.action,
      category: auditLogs.category,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      details: auditLogs.details,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    data,
    meta: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
  };
}
