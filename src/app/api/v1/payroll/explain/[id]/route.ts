import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { explainPayrollCalculationTrace } from "@/lib/payroll/payroll-service";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  const sessionEmployeeId = (session.user as any).employeeId;

  try {
    const { id } = await params;
    const trace = await explainPayrollCalculationTrace(id);

    if (!trace) {
      return apiError("EMP_001", "Payroll record not found for explanation.", undefined, 404);
    }

    if (userRole === "employee") {
      if (trace.employeeId !== sessionEmployeeId) {
        return apiError("AUTH_004", "Forbidden. You can only view calculation trace for your own payroll records.", undefined, 403);
      }
    } else if (!canPerformAction(userRole, "PAYROLL_VIEW_EXPORT")) {
      return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
    }

    return apiSuccess(trace);
  } catch (error: any) {
    console.error("EXPLAIN_PAYROLL_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
