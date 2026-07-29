import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { auth } from "@/auth";
import { approveCorrection } from "@/lib/corrections/corrections-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  // Correction #3: Restrict approval to super_admin, admin, hr_payroll
  const allowedRoles = ["super_admin", "admin", "hr_payroll"];
  if (!allowedRoles.includes(userRole)) {
    return apiError("AUTH_004", "Forbidden. Insufficient permissions to approve corrections.", undefined, 403);
  }

  try {
    const { id: correctionId } = await params;
    const ipAddress = req.headers.get("x-forwarded-for") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    const approved = await approveCorrection({
      correctionId,
      approvedBy: userId,
      approverRole: userRole,
      ipAddress,
      userAgent,
    });

    return apiSuccess(approved);
  } catch (error: any) {
    console.error("APPROVE_CORRECTION_ERROR:", error);
    const msg = error.message || "Failed to approve correction request.";
    const isSegregation = msg.includes("CORR_002");
    return apiError(
      isSegregation ? "CORR_002" : "CORR_005",
      msg,
      undefined,
      isSegregation ? 403 : 400
    );
  }
}
