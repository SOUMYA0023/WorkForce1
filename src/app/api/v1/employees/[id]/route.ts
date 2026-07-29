import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { updateEmployeeSchema } from "@/lib/employees/validation";
import { logAuditEvent } from "@/lib/audit/logger";
import { eq, and, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  if (!canPerformAction(userRole, "EMPLOYEE_VIEW")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
  }

  const { id } = await params;
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, id), isNull(employees.deletedAt)),
  });

  if (!employee) {
    return apiError("EMP_001", undefined, undefined, 404);
  }

  return apiSuccess(employee);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (!canPerformAction(userRole, "EMPLOYEE_UPDATE")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
  }

  const { id } = await params;

  try {
    const existing = await db.query.employees.findFirst({
      where: and(eq(employees.id, id), isNull(employees.deletedAt)),
    });

    if (!existing) {
      return apiError("EMP_001", undefined, undefined, 404);
    }

    const body = await req.json();
    const validation = updateEmployeeSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        "EMP_005",
        "Employee update validation failed.",
        validation.error.flatten(),
        400
      );
    }

    const data = validation.data;

    let updatedEmployee: any = null;
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(employees)
        .set({
          ...(data.employeeCode ? { employeeCode: data.employeeCode } : {}),
          ...(data.firstName ? { firstName: data.firstName } : {}),
          ...(data.lastName ? { lastName: data.lastName } : {}),
          ...(data.department ? { department: data.department } : {}),
          ...(data.designation ? { designation: data.designation } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
          ...(data.phoneNumber !== undefined
            ? { phoneNumber: data.phoneNumber || null }
            : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.joinedAt ? { joinedAt: data.joinedAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(employees.id, id))
        .returning();

      updatedEmployee = updated;

      await logAuditEvent({
        userId,
        action: "EMPLOYEE_UPDATED",
        category: "EMPLOYEE",
        resourceType: "employee",
        resourceId: id,
        details: {
          previous: { status: existing.status, department: existing.department },
          updated: { status: updated.status, department: updated.department },
        },
      });
    });

    return apiSuccess(updatedEmployee);
  } catch (error: any) {
    console.error("PATCH_EMPLOYEE_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (!canPerformAction(userRole, "EMPLOYEE_DELETE")) {
    return apiError("AUTH_004", "Forbidden. Insufficient role permissions.", undefined, 403);
  }

  const { id } = await params;

  try {
    const existing = await db.query.employees.findFirst({
      where: and(eq(employees.id, id), isNull(employees.deletedAt)),
    });

    if (!existing) {
      return apiError("EMP_001", undefined, undefined, 404);
    }

    const now = new Date();

    // Soft deletion
    await db.transaction(async (tx) => {
      await tx
        .update(employees)
        .set({
          deletedAt: now,
          deletedBy: userId,
          status: "inactive",
          updatedAt: now,
        })
        .where(eq(employees.id, id));

      await logAuditEvent({
        userId,
        action: "EMPLOYEE_SOFT_DELETED",
        category: "EMPLOYEE",
        resourceType: "employee",
        resourceId: id,
        details: {
          employeeCode: existing.employeeCode,
          name: `${existing.firstName} ${existing.lastName}`,
          deletedAt: now.toISOString(),
        },
      });
    });

    return apiSuccess({
      message: `Employee '${existing.employeeCode}' successfully soft-deleted.`,
    });
  } catch (error: any) {
    console.error("DELETE_EMPLOYEE_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
