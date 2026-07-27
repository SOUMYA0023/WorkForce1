import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { explainPayrollCalculationTrace } from "@/lib/payroll/payroll-service";
import { auth } from "@/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required.", undefined, 401);
  }

  try {
    const { id } = await params;
    const trace = await explainPayrollCalculationTrace(id);

    if (!trace) {
      return apiError("EMP_001", "Payroll record not found for explanation.", undefined, 404);
    }

    return apiSuccess(trace);
  } catch (error: any) {
    console.error("EXPLAIN_PAYROLL_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
