import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { createShiftTemplate, listShifts } from "@/lib/shifts/shift-service";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  try {
    const shiftsList = await listShifts();
    return apiSuccess(shiftsList);
  } catch (error: any) {
    console.error("GET_SHIFTS_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  if (!canPerformAction(userRole, "SHIFT_MANAGE")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
  }

  try {
    const body = await req.json();
    const { name, startTime, endTime, breakDurationSeconds, lateGraceSeconds, earlyExitGraceSeconds, overtimeThresholdSeconds } = body;

    if (!name || !startTime || !endTime) {
      return apiError("SYS_003", "Name, startTime, and endTime are required.", undefined, 400);
    }

    const shift = await createShiftTemplate(
      {
        name,
        startTime,
        endTime,
        breakDurationSeconds: Number(breakDurationSeconds) || 0,
        lateGraceSeconds: Number(lateGraceSeconds) || 600,
        earlyExitGraceSeconds: Number(earlyExitGraceSeconds) || 600,
        overtimeThresholdSeconds: Number(overtimeThresholdSeconds) || 0,
      },
      (session.user as any).id
    );

    return apiSuccess(shift, undefined, 201);
  } catch (error: any) {
    console.error("CREATE_SHIFT_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
