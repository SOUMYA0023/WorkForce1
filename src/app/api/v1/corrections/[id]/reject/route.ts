import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { auth } from "@/auth";
import { rejectCorrection } from "@/lib/corrections/corrections-service";

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

  const allowedRoles = ["super_admin", "admin", "hr_payroll"];
  if (!allowedRoles.includes(userRole)) {
    return apiError("AUTH_004", "Forbidden. Insufficient permissions to reject corrections.", undefined, 403);
  }

  try {
    const { id: correctionId } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Correction request rejected by administrator.";

    const rejected = await rejectCorrection({
      correctionId,
      rejectedBy: userId,
      rejecterRole: userRole,
      reason,
    });

    return apiSuccess(rejected);
  } catch (error: any) {
    console.error("REJECT_CORRECTION_ERROR:", error);
    return apiError("CORR_005", error.message || "Failed to reject correction request.", undefined, 400);
  }
}
