import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { apiError, apiSuccess } from "@/lib/api/response";
import { processEmployeeImport } from "@/lib/employees/import-engine";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateCheck = checkRateLimit(`import:${ip}`, 5, 60000);
  if (!rateCheck.isAllowed) {
    return apiError("SYS_001", "Rate limit exceeded for bulk import.", undefined, 429);
  }

  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (!canPerformAction(userRole, "EMPLOYEE_IMPORT")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
  }

  try {
    const { searchParams } = new URL(req.url);
    const isDryRun = searchParams.get("dryRun") === "true";

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return apiError("EMP_004", "No file uploaded.", undefined, 400);
    }

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase();

    if (ext !== "csv" && ext !== "xlsx") {
      return apiError(
        "EMP_004",
        "Invalid file extension. Only .csv and .xlsx files are supported.",
        undefined,
        400
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const importResult = await processEmployeeImport({
      buffer,
      filename,
      fileType: ext as "csv" | "xlsx",
      uploadedByUserId: userId,
      isDryRun,
    });

    return apiSuccess(importResult);
  } catch (error: any) {
    console.error("BULK_IMPORT_ROUTE_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
