import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { db } from "@/lib/db";
import { attendanceLedger, employees } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;
  const sessionEmployeeId = (session.user as any).employeeId;

  const { searchParams } = new URL(req.url);
  const targetEmployeeId = searchParams.get("employeeId") || sessionEmployeeId;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = (page - 1) * limit;

  // Employees can only view their own history
  if (userRole === "employee" && targetEmployeeId !== sessionEmployeeId) {
    return apiError("AUTH_004", "Forbidden. You can only view your own attendance history.", undefined, 403);
  }

  if (!targetEmployeeId) {
    return apiError("ATT_007", "Employee ID required.", undefined, 400);
  }

  try {
    const whereClause = eq(attendanceLedger.employeeId, targetEmployeeId);

    const [totalCount] = await db
      .select({ count: count() })
      .from(attendanceLedger)
      .where(whereClause);

    const records = await db
      .select()
      .from(attendanceLedger)
      .where(whereClause)
      .orderBy(desc(attendanceLedger.createdAt))
      .limit(limit)
      .offset(offset);

    return apiSuccess(records, {
      page,
      limit,
      total: totalCount?.count || 0,
      totalPages: Math.ceil((totalCount?.count || 0) / limit),
    });
  } catch (error: any) {
    console.error("ATTENDANCE_HISTORY_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
