import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { corrections, employees, users } from "@/lib/db/schema";
import { submitCorrectionRequest } from "@/lib/corrections/corrections-service";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  // Correction #4: Block employee role from corrections view
  if (userRole === "employee") {
    return apiError("AUTH_004", "Forbidden. Employee role cannot view corrections queue.", undefined, 403);
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;

  try {
    let query = db
      .select({
        id: corrections.id,
        attendanceEventId: corrections.attendanceEventId,
        employeeId: corrections.employeeId,
        employeeCode: employees.employeeCode,
        employeeName: employees.firstName,
        correctionType: corrections.correctionType,
        originalTimestamp: corrections.originalTimestamp,
        correctedTimestamp: corrections.correctedTimestamp,
        reason: corrections.reason,
        status: corrections.status,
        payrollImpact: corrections.payrollImpact,
        createdAt: corrections.createdAt,
      })
      .from(corrections)
      .innerJoin(employees, eq(corrections.employeeId, employees.id))
      .orderBy(desc(corrections.createdAt));

    const records = await query;
    return apiSuccess(records);
  } catch (error: any) {
    console.error("GET_CORRECTIONS_ERROR:", error);
    return apiError("SYS_002", "Failed to retrieve correction requests.", undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  // Correction #3: Restrict submission to admin, super_admin, hr_payroll only
  const allowedRoles = ["super_admin", "admin", "hr_payroll"];
  if (!allowedRoles.includes(userRole)) {
    return apiError("CORR_003", "Forbidden. Gate operators and employees cannot submit correction requests.", undefined, 403);
  }

  try {
    const body = await req.json();
    const { attendanceEventId, employeeId, correctionType, originalTimestamp, correctedTimestamp, reason } = body;

    if (!employeeId || !correctionType || !correctedTimestamp || !reason) {
      return apiError("CORR_001", "Missing required fields: employeeId, correctionType, correctedTimestamp, reason.", undefined, 400);
    }

    const newCorrection = await submitCorrectionRequest({
      attendanceEventId,
      employeeId,
      correctedBy: userId,
      submitterRole: userRole,
      correctionType,
      originalTimestamp: originalTimestamp ? new Date(originalTimestamp) : undefined,
      correctedTimestamp: new Date(correctedTimestamp),
      reason,
    });

    return apiSuccess(newCorrection, undefined, 201);
  } catch (error: any) {
    console.error("POST_CORRECTION_ERROR:", error);
    return apiError("CORR_001", error.message || "Failed to submit correction request.", undefined, 400);
  }
}
