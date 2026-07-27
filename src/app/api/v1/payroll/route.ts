import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { processDailyPayrollRecord } from "@/lib/payroll/payroll-service";
import { db } from "@/lib/db";
import { payrollRecords, employees } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  const periodDate = searchParams.get("periodDate");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = (page - 1) * limit;

  try {
    const whereConditions = [];
    if (employeeId) whereConditions.push(eq(payrollRecords.employeeId, employeeId));
    if (periodDate) whereConditions.push(eq(payrollRecords.periodDate, periodDate));

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [total] = await db
      .select({ count: count() })
      .from(payrollRecords)
      .where(whereClause);

    const records = await db
      .select({
        id: payrollRecords.id,
        employeeId: payrollRecords.employeeId,
        periodDate: payrollRecords.periodDate,
        shiftId: payrollRecords.shiftId,
        checkInTimestamp: payrollRecords.checkInTimestamp,
        checkOutTimestamp: payrollRecords.checkOutTimestamp,
        scheduledSeconds: payrollRecords.scheduledSeconds,
        actualWorkedSeconds: payrollRecords.actualWorkedSeconds,
        breakSeconds: payrollRecords.breakSeconds,
        netWorkedSeconds: payrollRecords.netWorkedSeconds,
        overtimeSeconds: payrollRecords.overtimeSeconds,
        undertimeSeconds: payrollRecords.undertimeSeconds,
        lateArrivalSeconds: payrollRecords.lateArrivalSeconds,
        earlyExitSeconds: payrollRecords.earlyExitSeconds,
        isFinalized: payrollRecords.isFinalized,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
        department: employees.department,
      })
      .from(payrollRecords)
      .leftJoin(employees, eq(payrollRecords.employeeId, employees.id))
      .where(whereClause)
      .orderBy(desc(payrollRecords.periodDate))
      .limit(limit)
      .offset(offset);

    return apiSuccess(records, {
      page,
      limit,
      total: total?.count || 0,
      totalPages: Math.ceil((total?.count || 0) / limit),
    });
  } catch (error: any) {
    console.error("GET_PAYROLL_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  if (!canPerformAction(userRole, "PAYROLL_CALCULATE")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions for payroll calculation.", undefined, 403);
  }

  try {
    const body = await req.json();
    const { employeeId, periodDate } = body;

    if (!employeeId || !periodDate) {
      return apiError("SYS_003", "employeeId and periodDate are required.", undefined, 400);
    }

    const record = await processDailyPayrollRecord({
      employeeId,
      periodDate,
      actorUserId: (session.user as any).id,
    });

    if (!record) {
      return apiError("EMP_005", "Cannot calculate payroll: incomplete check-in/check-out or no assigned shift.", undefined, 400);
    }

    return apiSuccess(record, undefined, 201);
  } catch (error: any) {
    console.error("PROCESS_PAYROLL_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
