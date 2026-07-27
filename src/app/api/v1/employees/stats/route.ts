import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { db } from "@/lib/db";
import { employees, importBatches } from "@/lib/db/schema";
import { count, isNull, eq, and, sql } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();

  try {
    // Total Non-Deleted Employees
    const [totalRes] = await db
      .select({ count: count() })
      .from(employees)
      .where(isNull(employees.deletedAt));

    // Active Employees
    const [activeRes] = await db
      .select({ count: count() })
      .from(employees)
      .where(and(eq(employees.status, "active"), isNull(employees.deletedAt)));

    // Inactive Employees (inactive, suspended, terminated, on_leave)
    const [inactiveRes] = await db
      .select({ count: count() })
      .from(employees)
      .where(and(sql`${employees.status} != 'active'`, isNull(employees.deletedAt)));

    // Recent Import Batches (last 5)
    const recentImports = await db
      .select()
      .from(importBatches)
      .orderBy(sql`${importBatches.createdAt} DESC`)
      .limit(5);

    // Sum of failed records across all imports
    const [failedImportsRes] = await db
      .select({ totalFailed: sql<number>`COALESCE(SUM(${importBatches.failedRecords}), 0)` })
      .from(importBatches);

    return apiSuccess({
      totalEmployees: totalRes?.count || 0,
      activeEmployees: activeRes?.count || 0,
      inactiveEmployees: inactiveRes?.count || 0,
      totalFailedImportRecords: Number(failedImportsRes?.totalFailed || 0),
      recentImports,
    });
  } catch (error: any) {
    console.error("EMPLOYEE_STATS_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
