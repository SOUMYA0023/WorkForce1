import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import { payrollRecords, employees, shifts } from "@/lib/db/schema";
import { exportPayrollToCsv, exportPayrollToXlsx } from "@/lib/export/export-service";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/logger";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateCheck = checkRateLimit(`export_payroll:${ip}`, 10, 60000);
  if (!rateCheck.isAllowed) {
    await logAuditEvent({
      action: "RATE_LIMIT_EXCEEDED",
      category: "SECURITY",
      details: { endpoint: "/api/v1/export/payroll" },
      ipAddress: ip,
    });
    return apiError("SYS_001", "Rate limit exceeded for payroll export.", undefined, 429);
  }

  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  if (!canPerformAction(userRole, "PAYROLL_VIEW_EXPORT")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions for payroll export.", undefined, 403);
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  try {
    const rawRecords = await db
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
        undertimeSeconds: payrollRecords.undertimeSeconds,
        lateArrivalSeconds: payrollRecords.lateArrivalSeconds,
        isFinalized: payrollRecords.isFinalized,
      })
      .from(payrollRecords)
      .leftJoin(employees, eq(payrollRecords.employeeId, employees.id))
      .leftJoin(shifts, eq(payrollRecords.shiftId, shifts.id))
      .orderBy(desc(payrollRecords.periodDate))
      .limit(500);

    const exportRows = rawRecords.map((r) => ({
      employeeCode: r.employeeCode || "N/A",
      employeeName: `${r.firstName || ""} ${r.lastName || ""}`.trim(),
      department: r.department || "General",
      periodDate: r.periodDate,
      shiftName: r.shiftName || "Standard",
      scheduledHours: (r.scheduledSeconds / 3600).toFixed(2),
      actualWorkedHours: (r.actualWorkedSeconds / 3600).toFixed(2),
      overtimeHours: (r.overtimeSeconds / 3600).toFixed(2),
      undertimeHours: (r.undertimeSeconds / 3600).toFixed(2),
      lateArrivalMinutes: Math.floor((r.lateArrivalSeconds || 0) / 60),
      isFinalized: r.isFinalized ? "YES" : "NO",
    }));

    await logAuditEvent({
      userId: (session.user as any).id,
      action: "PAYROLL_EXPORT",
      category: "EXPORT",
      resourceType: "payroll",
      details: { format, recordCount: exportRows.length },
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    if (format === "xlsx") {
      const buffer = exportPayrollToXlsx(exportRows);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Payroll_Summary_${Date.now()}.xlsx"`,
        },
      });
    } else {
      const csvData = exportPayrollToCsv(exportRows);
      return new NextResponse(csvData, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Payroll_Summary_${Date.now()}.csv"`,
        },
      });
    }
  } catch (error: any) {
    console.error("EXPORT_PAYROLL_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
