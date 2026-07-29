/**
 * System Configuration Management API Route — /api/v1/config (FR-045, NFR-007, SR-005)
 *
 * GET /api/v1/config — List system configuration settings. RBAC: super_admin, admin.
 * PATCH /api/v1/config — Update a configuration threshold. RBAC: super_admin only (SYSTEM_CONFIG_MANAGE).
 * Logs audit trail under category: "CONFIG" (action: "SYSTEM_CONFIG_UPDATED").
 */

import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { db } from "@/lib/db";
import { systemConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { canPerformAction } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/logger";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  if (userRole === "employee" || userRole === "gate_operator") {
    return apiError("AUTH_004", "Forbidden. Insufficient permissions to view system config.", undefined, 403);
  }

  try {
    const configs = await db.select().from(systemConfig);
    return apiSuccess(configs);
  } catch (error: any) {
    console.error("GET_CONFIG_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (!canPerformAction(userRole, "SYSTEM_CONFIG_MANAGE")) {
    return apiError("AUTH_004", "Forbidden. Only super_admin can modify system configuration.", undefined, 403);
  }

  try {
    const body = await req.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return apiError("SYS_003", "Config 'key' and 'value' are required.", undefined, 400);
    }

    const keyStr = String(key).trim();
    const valStr = String(value).trim();

    const existing = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.key, keyStr),
    });

    let updatedRecord: any = null;

    if (existing) {
      const [updated] = await db
        .update(systemConfig)
        .set({
          value: valStr,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(systemConfig.key, keyStr))
        .returning();
      updatedRecord = updated;
    } else {
      const [inserted] = await db
        .insert(systemConfig)
        .values({
          key: keyStr,
          value: valStr,
          updatedBy: userId,
        })
        .returning();
      updatedRecord = inserted;
    }

    // Audit trail under category: "CONFIG" per SR-005
    await logAuditEvent({
      userId,
      action: "SYSTEM_CONFIG_UPDATED",
      category: "CONFIG",
      resourceType: "system_config",
      resourceId: updatedRecord.id,
      details: {
        key: keyStr,
        previousValue: existing?.value || null,
        newValue: valStr,
      },
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return apiSuccess(updatedRecord);
  } catch (error: any) {
    console.error("PATCH_CONFIG_ERROR:", error);
    return apiError("SYS_002", undefined, undefined, 500);
  }
}
