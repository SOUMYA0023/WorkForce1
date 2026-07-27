/**
 * Extended Audit Logger (SR-005, SR-012, Refinement #7 & #14)
 *
 * Implements immutable append-only audit logging for:
 * - AUTH       (Login success, failure, lockout, logout)
 * - EMPLOYEE   (Create, update, soft delete, status change, bulk import)
 * - SHIFT      (Shift templates, shift assignments)
 * - PAYROLL    (Calculations, recalculation triggers)
 * - ATTENDANCE (Tokens, events, overrides)
 * - SYSTEM     (Config changes)
 *
 * Captures request ID, session ID, IP address, user agent, browser, OS,
 * timestamp, result, and failure reason in details JSON.
 */

import { db } from "../db";
import { auditLogs } from "../db/schema";

export type AuditCategory =
  | "AUTH"
  | "EMPLOYEE"
  | "SHIFT"
  | "PAYROLL"
  | "ATTENDANCE"
  | "SYSTEM";

export interface LogAuditParams {
  userId?: string | null;
  action: string;
  category: AuditCategory;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function parseUserAgent(uaString?: string | null) {
  if (!uaString) return { browser: "Unknown", os: "Unknown" };

  let browser = "Unknown";
  let os = "Unknown";

  if (uaString.includes("Firefox")) browser = "Firefox";
  else if (uaString.includes("Chrome")) browser = "Chrome";
  else if (uaString.includes("Safari")) browser = "Safari";
  else if (uaString.includes("Edge")) browser = "Edge";

  if (uaString.includes("Mac OS")) os = "macOS";
  else if (uaString.includes("Windows")) os = "Windows";
  else if (uaString.includes("Linux")) os = "Linux";
  else if (uaString.includes("Android")) os = "Android";
  else if (uaString.includes("iPhone") || uaString.includes("iPad")) os = "iOS";

  return { browser, os };
}

export async function logAuditEvent(params: LogAuditParams) {
  try {
    const { browser, os } = parseUserAgent(params.userAgent);

    const enrichedDetails = {
      ...(params.details || {}),
      browser,
      os,
      loggedAt: new Date().toISOString(),
    };

    await db.insert(auditLogs).values({
      userId: params.userId || null,
      action: params.action,
      category: params.category,
      resourceType: params.resourceType || null,
      resourceId: params.resourceId || null,
      details: enrichedDetails,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (error) {
    // Audit logging failure should not crash the main transaction if outside,
    // but should be output to server stderr
    console.error("FAILED_TO_WRITE_AUDIT_LOG:", error);
  }
}
