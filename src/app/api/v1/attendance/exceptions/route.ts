import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { auth } from "@/auth";
import { getAttendanceExceptions } from "@/lib/attendance/monitoring-service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  // Correction #4 & #3: Block employee and gate_operator roles from exceptions queue
  const allowedRoles = ["super_admin", "admin", "hr_payroll"];
  if (!allowedRoles.includes(userRole)) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions for exception queue.", undefined, 403);
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || undefined;
  const exceptionType = (searchParams.get("type") as any) || undefined;
  const department = searchParams.get("department") || undefined;

  try {
    const exceptions = await getAttendanceExceptions({ date, exceptionType, department });
    return apiSuccess(exceptions);
  } catch (error: any) {
    console.error("EXCEPTIONS_ERROR:", error);
    return apiError("SYS_002", "Failed to retrieve attendance exception queue.", undefined, 500);
  }
}
