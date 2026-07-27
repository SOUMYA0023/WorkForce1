import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { assignShiftToEmployee } from "@/lib/shifts/shift-service";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  if (!canPerformAction(userRole, "SHIFT_ASSIGN")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
  }

  try {
    const body = await req.json();
    const { employeeId, shiftId, effectiveFrom, effectiveTo } = body;

    if (!employeeId || !shiftId || !effectiveFrom) {
      return apiError("SYS_003", "employeeId, shiftId, and effectiveFrom are required.", undefined, 400);
    }

    const assignment = await assignShiftToEmployee({
      employeeId,
      shiftId,
      effectiveFrom,
      effectiveTo: effectiveTo || null,
      assignedBy: (session.user as any).id,
    });

    return apiSuccess(assignment, undefined, 201);
  } catch (error: any) {
    console.error("ASSIGN_SHIFT_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
