import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { apiError, apiSuccess } from "@/lib/api/response";
import { processAttendanceScan } from "@/lib/attendance/check-in-out";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/logger";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";

  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (!canPerformAction(userRole, "ATTENDANCE_SCAN")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions for attendance scanning.", undefined, 403);
  }

  // Rate limiting (max 60 scan attempts per minute per scanner account)
  const rateCheck = checkRateLimit(`scan:${userId}`, 60, 60000);
  if (!rateCheck.isAllowed) {
    await logAuditEvent({
      userId,
      action: "RATE_LIMIT_EXCEEDED",
      category: "SECURITY",
      details: { endpoint: "/api/v1/attendance/scan" },
      ipAddress: ip,
      userAgent,
    });
    return apiError("SYS_001", "Rate limit exceeded for attendance scanner.", undefined, 429);
  }

  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return apiError("ATT_006", "Attendance QR token payload is required.", undefined, 400);
    }

    const scanResult = await processAttendanceScan({
      rawToken: String(token).trim(),
      scannerUserId: userId,
      ipAddress: ip,
      userAgent,
    });

    if (!scanResult.success) {
      return apiError(
        (scanResult.errorCode as any) || "ATT_006",
        scanResult.errorMessage,
        undefined,
        400
      );
    }

    return apiSuccess(scanResult);
  } catch (error: any) {
    console.error("ATTENDANCE_SCAN_ROUTE_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
