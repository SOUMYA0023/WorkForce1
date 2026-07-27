/**
 * Cryptographic QR Token Engine (FR-010 to FR-017, ADR §7)
 *
 * Refinements applied:
 * 1. Single Active Token per Action (Refinement #1 & #6):
 *    When a new token is generated, any previous unconsumed active tokens
 *    for (employeeId, tokenType) are invalidated immediately.
 * 2. Cryptographic Security & Unique Hashes (Refinement #2):
 *    256-bit random entropy payload hashed with SHA-256.
 * 3. Atomic Token Claiming (ADR §7):
 *    Single UPDATE...RETURNING statement guarantees single-use and prevents TOCTOU race conditions.
 */

import crypto from "crypto";
import { db } from "../db";
import { attendanceTokens } from "../db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { recordTokenGenerated } from "./metrics";

export const QR_TOKEN_VALIDITY_SECONDS = parseInt(
  process.env.QR_TOKEN_VALIDITY_SECONDS || "30",
  10
);

export const QR_TOKEN_REFRESH_INTERVAL_SECONDS = parseInt(
  process.env.QR_TOKEN_REFRESH_INTERVAL_SECONDS || "15",
  10
);

export function hashTokenPayload(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function generateAttendanceToken(
  employeeId: string,
  tokenType: "check_in" | "check_out"
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + QR_TOKEN_VALIDITY_SECONDS * 1000);

  // 1. Refinement #6: Invalidate any previous unconsumed active tokens for this employee & type
  await db
    .update(attendanceTokens)
    .set({
      isConsumed: true,
      consumedAt: now,
    })
    .where(
      and(
        eq(attendanceTokens.employeeId, employeeId),
        eq(attendanceTokens.tokenType, tokenType),
        eq(attendanceTokens.isConsumed, false)
      )
    );

  // 2. Generate 256-bit random raw token payload
  const randomPayload = crypto.randomBytes(32).toString("hex");
  const rawToken = `${employeeId}:${tokenType}:${randomPayload}`;
  const tokenHash = hashTokenPayload(rawToken);

  // 3. Store hashed token in DB
  const [tokenRecord] = await db
    .insert(attendanceTokens)
    .values({
      employeeId,
      tokenHash,
      tokenType,
      generatedAt: now,
      expiresAt,
      isConsumed: false,
    })
    .returning();

  recordTokenGenerated();

  return {
    tokenId: tokenRecord.id,
    rawToken,
    tokenType,
    expiresAt: expiresAt.toISOString(),
    refreshIntervalSeconds: QR_TOKEN_REFRESH_INTERVAL_SECONDS,
  };
}

export interface ClaimTokenResult {
  success: boolean;
  tokenRecord?: any;
  errorCode?: "ATT_004" | "ATT_005" | "ATT_006";
  errorMessage?: string;
}

export async function claimAttendanceToken(
  rawToken: string
): Promise<ClaimTokenResult> {
  const tokenHash = hashTokenPayload(rawToken);
  const now = new Date();

  // ATOMIC CLAIM: UPDATE...RETURNING (ADR §7)
  const claimedRows = await db
    .update(attendanceTokens)
    .set({
      isConsumed: true,
      consumedAt: now,
    })
    .where(
      and(
        eq(attendanceTokens.tokenHash, tokenHash),
        eq(attendanceTokens.isConsumed, false),
        sql`${attendanceTokens.expiresAt} > ${now}`
      )
    )
    .returning();

  if (claimedRows.length > 0) {
    return {
      success: true,
      tokenRecord: claimedRows[0],
    };
  }

  // Diagnostic Path for Rejection Code (only executed when atomic claim fails)
  const existing = await db.query.attendanceTokens.findFirst({
    where: eq(attendanceTokens.tokenHash, tokenHash),
  });

  if (!existing) {
    return {
      success: false,
      errorCode: "ATT_006",
      errorMessage: "Invalid or forged QR attendance token.",
    };
  }

  if (existing.isConsumed) {
    return {
      success: false,
      errorCode: "ATT_005",
      errorMessage: "QR attendance token has already been used (single-use constraint).",
    };
  }

  if (new Date(existing.expiresAt) <= now) {
    return {
      success: false,
      errorCode: "ATT_004",
      errorMessage: "QR attendance token has expired.",
    };
  }

  return {
    success: false,
    errorCode: "ATT_006",
    errorMessage: "Invalid attendance token.",
  };
}

export async function cleanupExpiredTokens() {
  const now = new Date();
  // Delete consumed or expired tokens older than 24 hours to keep DB lean
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return db
    .delete(attendanceTokens)
    .where(
      and(
        eq(attendanceTokens.isConsumed, true),
        lt(attendanceTokens.expiresAt, cutoff)
      )
    );
}
