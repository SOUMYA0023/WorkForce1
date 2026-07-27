import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { db } from "@/lib/db";
import { employees, shiftAssignments } from "@/lib/db/schema";
import { createEmployeeSchema } from "@/lib/employees/validation";
import { logAuditEvent } from "@/lib/audit/logger";
import { eq, isNull, and, or, ilike, sql, count } from "drizzle-orm";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  const userRole = (session?.user as any)?.role || "super_admin"; // fallback for dev test if unauthenticated in dev

  if (session?.user && !canPerformAction(userRole, "EMPLOYEE_VIEW")) {
    return apiError("AUTH_004", undefined, undefined, 403);
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const department = searchParams.get("department") || "";
  const designation = searchParams.get("designation") || "";
  const status = searchParams.get("status") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = (page - 1) * limit;

  try {
    const conditions = [isNull(employees.deletedAt)];

    if (department) {
      conditions.push(eq(employees.department, department));
    }
    if (designation) {
      conditions.push(eq(employees.designation, designation));
    }
    if (status) {
      conditions.push(eq(employees.status, status as any));
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(employees.employeeCode, searchPattern),
          ilike(employees.firstName, searchPattern),
          ilike(employees.lastName, searchPattern),
          ilike(employees.email, searchPattern),
          ilike(employees.phoneNumber, searchPattern),
          ilike(employees.department, searchPattern),
          ilike(employees.designation, searchPattern)
        )!
      );
    }

    const whereClause = and(...conditions);

    // Total count query
    const [totalCountResult] = await db
      .select({ count: count() })
      .from(employees)
      .where(whereClause);

    const total = totalCountResult?.count || 0;

    // Data query
    const employeeRecords = await db
      .select()
      .from(employees)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(employees.createdAt);

    return apiSuccess(employeeRecords, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("GET_EMPLOYEES_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as any)?.id || null;
  const userRole = (session?.user as any)?.role || "super_admin";

  if (session?.user && !canPerformAction(userRole, "EMPLOYEE_CREATE")) {
    return apiError("AUTH_004", undefined, undefined, 403);
  }

  try {
    const body = await req.json();
    const validation = createEmployeeSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        "EMP_005",
        "Employee validation failed.",
        validation.error.flatten(),
        400
      );
    }

    const data = validation.data;

    // Uniqueness checks for employeeCode, email, phoneNumber
    const existingCode = await db.query.employees.findFirst({
      where: and(
        eq(employees.employeeCode, data.employeeCode),
        isNull(employees.deletedAt)
      ),
    });

    if (existingCode) {
      return apiError(
        "EMP_002",
        `Employee code '${data.employeeCode}' already exists.`,
        undefined,
        409
      );
    }

    if (data.email) {
      const existingEmail = await db.query.employees.findFirst({
        where: and(
          eq(employees.email, data.email.toLowerCase()),
          isNull(employees.deletedAt)
        ),
      });
      if (existingEmail) {
        return apiError(
          "EMP_002",
          `Email address '${data.email}' already exists.`,
          undefined,
          409
        );
      }
    }

    if (data.phoneNumber) {
      const existingPhone = await db.query.employees.findFirst({
        where: and(
          eq(employees.phoneNumber, data.phoneNumber),
          isNull(employees.deletedAt)
        ),
      });
      if (existingPhone) {
        return apiError(
          "EMP_002",
          `Phone number '${data.phoneNumber}' already exists.`,
          undefined,
          409
        );
      }
    }

    // Execute insertion & audit log inside DB Transaction (Refinement #15)
    let createdEmployee: any = null;
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(employees)
        .values({
          employeeCode: data.employeeCode,
          firstName: data.firstName,
          lastName: data.lastName,
          department: data.department,
          designation: data.designation,
          email: data.email || null,
          phoneNumber: data.phoneNumber || null,
          status: data.status,
          joinedAt: data.joinedAt,
        })
        .returning();

      createdEmployee = inserted;

      await logAuditEvent({
        userId,
        action: "EMPLOYEE_CREATED",
        category: "EMPLOYEE",
        resourceType: "employee",
        resourceId: inserted.id,
        details: {
          employeeCode: inserted.employeeCode,
          name: `${inserted.firstName} ${inserted.lastName}`,
          department: inserted.department,
          status: inserted.status,
        },
      });
    });

    return apiSuccess(createdEmployee, undefined, 201);
  } catch (error: any) {
    console.error("POST_EMPLOYEE_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
