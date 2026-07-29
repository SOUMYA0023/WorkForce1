import { NextRequest, NextResponse } from "next/server";
import { generateCsvTemplate, generateXlsxTemplateBuffer } from "@/lib/employees/template";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";
import { apiError } from "@/lib/api/response";
import { logAuditEvent } from "@/lib/audit/logger";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  if (!canPerformAction(userRole, "EMPLOYEE_IMPORT")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  await logAuditEvent({
    userId: (session.user as any).id,
    action: "TEMPLATE_EXPORT",
    category: "EXPORT",
    resourceType: "template",
    details: { format },
    ipAddress: req.headers.get("x-forwarded-for") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
  });

  if (format === "xlsx") {
    const buffer = generateXlsxTemplateBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="employee_import_template.xlsx"',
      },
    });
  }

  const csv = generateCsvTemplate();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="employee_import_template.csv"',
    },
  });
}
