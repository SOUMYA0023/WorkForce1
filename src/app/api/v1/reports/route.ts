/**
 * Reports API Route — /api/v1/reports (RR-001 to RR-010, FR-040 to FR-043)
 *
 * GET /api/v1/reports?type=<reportType>&dateFrom=...&dateTo=...&department=...&format=json|csv|xlsx
 *
 * RBAC: super_admin, admin, hr_payroll can access all reports.
 *       gate_operator can access RR-001 (daily attendance) only.
 *       employee role is BLOCKED from all reports.
 *
 * Export Formats (FR-041):
 *   - JSON (default): Paginated response.
 *   - CSV: Flat file download via papaparse.
 *   - XLSX: Excel binary download via xlsx.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { apiError, apiSuccess } from "@/lib/api/response";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/logger";
import {
  getDailyAttendanceReport,
  getShiftWiseAttendanceReport,
  getDepartmentWiseAttendanceReport,
  getEmployeeMonthlyAttendanceReport,
  getOvertimeReport,
  getLateArrivalReport,
  getEarlyExitReport,
  getPayrollExportReport,
  getAttendanceExceptionReport,
  getAuditLogReport,
  VALID_AUDIT_CATEGORIES,
} from "@/lib/reports/reporting-service";
import type { ReportFilters, AuditLogFilters } from "@/lib/reports/reporting-service";
import type { AuditCategory } from "@/lib/audit/logger";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// All valid report types mapped to their IDs
const REPORT_TYPES = [
  "daily-attendance",       // RR-001
  "shift-wise",             // RR-002
  "department-wise",        // RR-003
  "employee-monthly",       // RR-004
  "overtime",               // RR-005
  "late-arrival",           // RR-006
  "early-exit",             // RR-007
  "payroll-export",         // RR-008
  "attendance-exception",   // RR-009
  "audit-log",              // RR-010
] as const;

type ReportType = (typeof REPORT_TYPES)[number];

// Reports accessible by gate_operator role (limited)
const GATE_OPERATOR_ALLOWED_REPORTS: ReportType[] = ["daily-attendance"];

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateCheck = checkRateLimit(`reports:${ip}`, 30, 60000);
  if (!rateCheck.isAllowed) {
    await logAuditEvent({
      action: "RATE_LIMIT_EXCEEDED",
      category: "SECURITY",
      details: { endpoint: "/api/v1/reports" },
      ipAddress: ip,
    });
    return apiError("SYS_001", "Rate limit exceeded for reports API.", undefined, 429);
  }

  // Auth check
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const userRole = (session.user as any).role;

  // Employee role is BLOCKED from all reports
  if (userRole === "employee") {
    return apiError("AUTH_004", "Forbidden. Employees cannot access enterprise reports.", undefined, 403);
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const reportType = searchParams.get("type") as ReportType | null;
  const format = (searchParams.get("format") || "json") as "json" | "csv" | "xlsx";
  const dateFrom = searchParams.get("dateFrom") || undefined;
  const dateTo = searchParams.get("dateTo") || undefined;
  const department = searchParams.get("department") || undefined;
  const employeeId = searchParams.get("employeeId") || undefined;
  const shiftId = searchParams.get("shiftId") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

  // Validate report type
  if (!reportType || !REPORT_TYPES.includes(reportType)) {
    return apiError("SYS_003", `Invalid report type. Valid types: ${REPORT_TYPES.join(", ")}`, undefined, 400);
  }

  // Gate operator role restriction
  if (userRole === "gate_operator" && !GATE_OPERATOR_ALLOWED_REPORTS.includes(reportType)) {
    return apiError("AUTH_004", "Forbidden. Gate operators can only access the daily attendance report.", undefined, 403);
  }

  // For payroll and audit reports, require specific RBAC permissions
  if (reportType === "payroll-export" && !canPerformAction(userRole, "PAYROLL_VIEW_EXPORT")) {
    return apiError("AUTH_004", "Forbidden. Insufficient permissions for payroll reports.", undefined, 403);
  }
  if (reportType === "audit-log" && !canPerformAction(userRole, "AUDIT_LOG_VIEW")) {
    return apiError("AUTH_004", "Forbidden. Insufficient permissions for audit log reports.", undefined, 403);
  }

  try {
    const filters: ReportFilters = { dateFrom, dateTo, department, employeeId, shiftId, page, pageSize };
    let result: any;

    switch (reportType) {
      case "daily-attendance":
        result = await getDailyAttendanceReport(filters);
        break;
      case "shift-wise":
        result = await getShiftWiseAttendanceReport(filters);
        break;
      case "department-wise":
        result = await getDepartmentWiseAttendanceReport(filters);
        break;
      case "employee-monthly":
        result = await getEmployeeMonthlyAttendanceReport(filters);
        break;
      case "overtime":
        result = await getOvertimeReport(filters);
        break;
      case "late-arrival":
        result = await getLateArrivalReport(filters);
        break;
      case "early-exit":
        result = await getEarlyExitReport(filters);
        break;
      case "payroll-export":
        result = await getPayrollExportReport(filters);
        break;
      case "attendance-exception":
        result = await getAttendanceExceptionReport(filters);
        break;
      case "audit-log": {
        // Audit log has extra filters: category, userId, action
        const auditCategory = searchParams.get("category") as AuditCategory | null;
        const auditUserId = searchParams.get("userId") || undefined;
        const auditAction = searchParams.get("action") || undefined;

        // Validate audit category filter if provided
        if (auditCategory && !VALID_AUDIT_CATEGORIES.includes(auditCategory)) {
          return apiError(
            "SYS_003",
            `Invalid audit category. Valid categories: ${VALID_AUDIT_CATEGORIES.join(", ")}`,
            undefined,
            400
          );
        }

        const auditFilters: AuditLogFilters = {
          dateFrom,
          dateTo,
          category: auditCategory || undefined,
          userId: auditUserId,
          action: auditAction,
          page,
          pageSize,
        };
        result = await getAuditLogReport(auditFilters);
        break;
      }
    }

    // JSON response (default)
    if (format === "json") {
      return apiSuccess(result.data, result.meta);
    }

    // Export to CSV or XLSX (FR-041) — for exports, fetch ALL matching rows (up to 10,000 cap)
    // For exports, re-query without pagination limits (capped at 10,000 for safety)
    const exportFilters = { ...filters, page: 1, pageSize: 200 };
    let allData = result.data;

    // For exports with more data, fetch in batches up to 10,000 total
    if (result.meta.totalCount > 200) {
      allData = [];
      const totalPages = Math.min(Math.ceil(result.meta.totalCount / 200), 50); // 50 pages × 200 = 10,000 max
      for (let p = 1; p <= totalPages; p++) {
        const batchFilters = { ...filters, page: p, pageSize: 200 };
        let batchResult: any;
        switch (reportType) {
          case "daily-attendance": batchResult = await getDailyAttendanceReport(batchFilters); break;
          case "shift-wise": batchResult = await getShiftWiseAttendanceReport(batchFilters); break;
          case "department-wise": batchResult = await getDepartmentWiseAttendanceReport(batchFilters); break;
          case "employee-monthly": batchResult = await getEmployeeMonthlyAttendanceReport(batchFilters); break;
          case "overtime": batchResult = await getOvertimeReport(batchFilters); break;
          case "late-arrival": batchResult = await getLateArrivalReport(batchFilters); break;
          case "early-exit": batchResult = await getEarlyExitReport(batchFilters); break;
          case "payroll-export": batchResult = await getPayrollExportReport(batchFilters); break;
          case "attendance-exception": batchResult = await getAttendanceExceptionReport(batchFilters); break;
          case "audit-log": batchResult = await getAuditLogReport({ dateFrom, dateTo, page: p, pageSize: 200 }); break;
        }
        allData.push(...batchResult.data);
      }
    }

    const reportTitle = reportType.replace(/-/g, "_").toUpperCase();
    const timestamp = new Date().toISOString().split("T")[0];

    await logAuditEvent({
      userId: (session.user as any).id,
      action: "REPORT_EXPORT",
      category: "EXPORT",
      resourceType: "report",
      details: { reportType, format, recordCount: allData.length },
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    if (format === "csv") {
      const csvData = Papa.unparse(allData);
      return new NextResponse(csvData, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${reportTitle}_${timestamp}.csv"`,
        },
      });
    }

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(allData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, reportTitle.substring(0, 31));
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${reportTitle}_${timestamp}.xlsx"`,
        },
      });
    }

    return apiError("SYS_003", "Invalid format. Use json, csv, or xlsx.", undefined, 400);
  } catch (error: any) {
    console.error("REPORTS_API_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
