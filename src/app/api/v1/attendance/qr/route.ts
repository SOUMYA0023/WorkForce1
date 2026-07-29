import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { apiError, apiSuccess } from "@/lib/api/response";
import { generateAttendanceToken } from "@/lib/attendance/token-engine";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { logAuditEvent } from "@/lib/audit/logger";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const employeeId = (session.user as any).employeeId;

  // Rate limiting (max 30 token requests per min per user)
  const rateCheck = checkRateLimit(`qr_gen:${userId}`, 30, 60000);
  if (!rateCheck.isAllowed) {
    const ip = req.headers.get("x-forwarded-for") || undefined;
    await logAuditEvent({
      userId,
      action: "RATE_LIMIT_EXCEEDED",
      category: "SECURITY",
      details: { endpoint: "/api/v1/attendance/qr" },
      ipAddress: ip,
    });
    return apiError("SYS_001", "Rate limit exceeded for QR generation.", undefined, 429);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tokenType = body.tokenType === "check_out" ? "check_out" : "check_in";

    // Retrieve linked employee ID if not set directly in session
    let targetEmployeeId = employeeId;
    if (!targetEmployeeId) {
      const userRecord = await db.query.users.findFirst({
        where: eq(employees.id, userId),
      });
      targetEmployeeId = (userRecord as any)?.employeeId;
    }

    if (!targetEmployeeId) {
      return apiError(
        "ATT_007",
        "No employee profile is linked to your user account.",
        undefined,
        400
      );
    }

    // Verify employee is active
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.id, targetEmployeeId), isNull(employees.deletedAt)),
    });

    if (!emp || emp.status !== "active") {
      return apiError(
        "ATT_007",
        `Employee state '${emp?.status || "inactive"}' prohibits QR generation.`,
        undefined,
        403
      );
    }

    // Generate token (automatically invalidates any previous active tokens for employee/type)
    const tokenData = await generateAttendanceToken(targetEmployeeId, tokenType);

    return apiSuccess(tokenData);
  } catch (error: any) {
    console.error("QR_GENERATE_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
