import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import { payrollRecords, employees, shifts } from "@/lib/db/schema";
import { exportPayrollToCsv, exportPayrollToXlsx } from "@/lib/export/export-service";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
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
