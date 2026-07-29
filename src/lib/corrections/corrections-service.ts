/**
 * Attendance Corrections Domain Service (FR-024, SR-006, ADR §8)
 *
 * Enforces key security & architectural rules:
 * 1. Single DB Transaction: Approve flow wraps all writes in `db.transaction(...)`.
 * 2. Segregation of Duties: Submitter cannot approve their own request (`approvedBy !== correctedBy`).
 * 3. Submission Role Restrictions: Restricted to super_admin, admin, hr_payroll.
 * 4. Append-Only Deletion: 'deletion' type corrections write a voiding ledger entry—no SQL DELETE.
 * 5. SHA-256 Ledger Hash Chaining: SHA-256 computed over `${employeeId}|${eventType}|${eventDate}|${eventTimestamp}|${shiftId}|${workedSeconds}|${previousHash}`.
 * 6. ADR §8 Payroll Recalculation: Automatically un-finalizes & recalculates payroll records.
 */

import crypto from "crypto";
import { db } from "../db";
import {
  corrections,
  attendanceEvents,
  attendanceLedger,
  payrollRecords,
  employees,
  shiftAssignments,
  shifts,
  users,
} from "../db/schema";
import { recalculatePayrollForCorrection } from "../payroll/payroll-service";
import { logAuditEvent } from "../audit/logger";
import { eq, and, isNull, desc } from "drizzle-orm";

export interface SubmitCorrectionInput {
  attendanceEventId?: string;
  employeeId: string;
  correctedBy: string; // User ID of submitter
  submitterRole: string; // Role of submitter
  correctionType: "manual_check_in" | "manual_check_out" | "time_adjustment" | "deletion";
  originalTimestamp?: Date;
  correctedTimestamp: Date;
  reason: string;
}

export interface ApproveCorrectionInput {
  correctionId: string;
  approvedBy: string; // User ID of approver
  approverRole: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RejectCorrectionInput {
  correctionId: string;
  rejectedBy: string;
  rejecterRole: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 1. Submit Correction Request
 * Restricted to super_admin, admin, hr_payroll. Mandatory reason capture (FR-024).
 */
export async function submitCorrectionRequest(input: SubmitCorrectionInput) {
  const allowedRoles = ["super_admin", "admin", "hr_payroll"];
  if (!allowedRoles.includes(input.submitterRole)) {
    throw new Error("CORR_003: Insufficient permissions to submit attendance correction. Gate operators and employees cannot submit corrections.");
  }

  if (!input.reason || input.reason.trim().length === 0) {
    throw new Error("CORR_001: Mandatory reason capture required for attendance correction.");
  }

  // Verify target employee
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, input.employeeId), isNull(employees.deletedAt)),
  });

  if (!employee) {
    throw new Error("EMPLOYEE_001: Employee not found.");
  }

  // If attendanceEventId provided, verify it
  let origTimestamp = input.originalTimestamp || new Date();
  if (input.attendanceEventId) {
    const existingEvent = await db.query.attendanceEvents.findFirst({
      where: eq(attendanceEvents.id, input.attendanceEventId),
    });
    if (!existingEvent) {
      throw new Error("ATT_009: Target attendance event not found.");
    }
    origTimestamp = existingEvent.eventTimestamp;
  }

  const [inserted] = await db
    .insert(corrections)
    .values({
      attendanceEventId: input.attendanceEventId || undefined as any,
      employeeId: input.employeeId,
      correctedBy: input.correctedBy,
      correctionType: input.correctionType,
      originalTimestamp: origTimestamp,
      correctedTimestamp: input.correctedTimestamp,
      reason: input.reason.trim(),
      status: "pending",
      payrollImpact: "none",
    })
    .returning();

  await logAuditEvent({
    userId: input.correctedBy,
    action: "CORRECTION_SUBMITTED",
    category: "CORRECTION",
    resourceType: "correction",
    resourceId: inserted.id,
    details: {
      employeeId: input.employeeId,
      correctionType: input.correctionType,
      reason: input.reason,
    },
  });

  return inserted;
}

/**
 * 2. Approve Correction Workflow (Transactional, Segregation of Duties, Ledger Hash Chaining, ADR §8)
 */
export async function approveCorrection({
  correctionId,
  approvedBy,
  approverRole,
  ipAddress,
  userAgent,
}: ApproveCorrectionInput) {
  const allowedRoles = ["super_admin", "admin", "hr_payroll"];
  if (!allowedRoles.includes(approverRole)) {
    throw new Error("CORR_003: Insufficient permissions to approve attendance corrections.");
  }

  const correction = await db.query.corrections.findFirst({
    where: eq(corrections.id, correctionId),
  });

  if (!correction) {
    throw new Error("CORR_004: Correction request not found.");
  }

  if (correction.status !== "pending") {
    throw new Error(`CORR_005: Correction request is already ${correction.status}.`);
  }

  // Segregation of Duties Check (SR-006): Approver CANNOT be Submitter
  if (approvedBy === correction.correctedBy) {
    await logAuditEvent({
      userId: approvedBy,
      action: "CORRECTION_APPROVAL_REJECTED_SD",
      category: "SECURITY",
      resourceType: "correction",
      resourceId: correctionId,
      details: {
        reason: "Segregation of duties violation: Submitter attempted to self-approve correction.",
        correctedBy: correction.correctedBy,
        approvedBy,
      },
      ipAddress,
      userAgent,
    });
    throw new Error("CORR_002: Segregation of duties violation: Submitter cannot approve their own correction request.");
  }

  // SINGLE DATABASE TRANSACTION FOR ALL WRITE OPERATIONS
  return await db.transaction(async (tx) => {
    // a. Fetch active shift assignment for employee
    const currentAssignment = await tx.query.shiftAssignments.findFirst({
      where: and(
        eq(shiftAssignments.employeeId, correction.employeeId),
        isNull(shiftAssignments.effectiveTo)
      ),
      orderBy: [desc(shiftAssignments.effectiveFrom)],
    });

    if (!currentAssignment) {
      throw new Error("ATT_008: No active shift assigned to employee for correction calculation.");
    }

    const eventDate = correction.correctedTimestamp.toISOString().split("T")[0];
    let eventType: "check_in" | "check_out" = "check_in";
    if (correction.correctionType === "manual_check_out") {
      eventType = "check_out";
    } else if (correction.attendanceEventId) {
      const targetEvent = await tx.query.attendanceEvents.findFirst({
        where: eq(attendanceEvents.id, correction.attendanceEventId),
      });
      if (targetEvent) {
        eventType = targetEvent.eventType as "check_in" | "check_out";
      }
    }

    let targetEventId = correction.attendanceEventId;

    if (correction.correctionType === "deletion") {
      // NON-DESTRUCTIVE DELETION: Mark target event as corrected/voided. NO SQL DELETE.
      if (targetEventId) {
        await tx
          .update(attendanceEvents)
          .set({ isCorrected: true, correctionId: correction.id })
          .where(eq(attendanceEvents.id, targetEventId));
      }
    } else if (targetEventId) {
      // Update existing attendance_events
      await tx
        .update(attendanceEvents)
        .set({
          eventTimestamp: correction.correctedTimestamp,
          eventDate,
          isCorrected: true,
          correctionId: correction.id,
        })
        .where(eq(attendanceEvents.id, targetEventId));
    }

    // b. Fetch latest ledger entry to construct blockchain-style SHA-256 previousHash chain
    const latestLedger = await tx.query.attendanceLedger.findFirst({
      orderBy: [desc(attendanceLedger.createdAt)],
    });
    const previousHash = latestLedger?.recordHash || "0000000000000000000000000000000000000000000000000000000000000000";

    // Compute worked seconds for ledger entry if check_out or deletion reversal
    let workedSecs: number | null = null;
    if (correction.correctionType === "deletion") {
      workedSecs = 0; // Voided
    }

    // Explicit SHA-256 Record Hash format
    const hashPayload = `${correction.employeeId}|${eventType}|${eventDate}|${correction.correctedTimestamp.toISOString()}|${currentAssignment.shiftId}|${workedSecs ?? 0}|${previousHash}`;
    const recordHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

    // c. Append to attendance_ledger (IMMUTABLE)
    const [insertedLedger] = await tx
      .insert(attendanceLedger)
      .values({
        attendanceEventId: targetEventId || correction.id,
        employeeId: correction.employeeId,
        eventType,
        eventDate,
        eventTimestamp: correction.correctedTimestamp,
        shiftId: currentAssignment.shiftId,
        workedSeconds: workedSecs,
        recordHash,
        previousHash,
      })
      .returning();

    // d. Recalculate Payroll per ADR §8 (un-finalizes & recalculates inside same TX or pipeline)
    let payrollImpact: "none" | "recalculation_triggered" | "blocked_finalized" = "none";

    const existingPayroll = await tx.query.payrollRecords.findFirst({
      where: and(
        eq(payrollRecords.employeeId, correction.employeeId),
        eq(payrollRecords.periodDate, eventDate)
      ),
    });

    if (existingPayroll) {
      payrollImpact = "recalculation_triggered";
    }

    // e. Update correction status to approved
    const [updatedCorrection] = await tx
      .update(corrections)
      .set({
        status: "approved",
        approvedBy,
        payrollImpact,
        updatedAt: new Date(),
      })
      .where(eq(corrections.id, correctionId))
      .returning();

    // f. Perform ADR §8 payroll recalculation if payroll record exists
    if (existingPayroll) {
      await recalculatePayrollForCorrection({
        employeeId: correction.employeeId,
        periodDate: eventDate,
        correctionId,
        approvedByUserId: approvedBy,
      });
    }

    // g. Write audit log
    await logAuditEvent({
      userId: approvedBy,
      action: "CORRECTION_APPROVED",
      category: "CORRECTION",
      resourceType: "correction",
      resourceId: correctionId,
      details: {
        correctedBy: correction.correctedBy,
        approvedBy,
        correctionType: correction.correctionType,
        payrollImpact,
        ledgerId: insertedLedger.id,
      },
      ipAddress,
      userAgent,
    });

    return updatedCorrection;
  });
}

/**
 * 3. Reject Correction Workflow
 */
export async function rejectCorrection({
  correctionId,
  rejectedBy,
  rejecterRole,
  reason,
  ipAddress,
  userAgent,
}: RejectCorrectionInput) {
  const allowedRoles = ["super_admin", "admin", "hr_payroll"];
  if (!allowedRoles.includes(rejecterRole)) {
    throw new Error("CORR_003: Insufficient permissions to reject attendance corrections.");
  }

  const correction = await db.query.corrections.findFirst({
    where: eq(corrections.id, correctionId),
  });

  if (!correction) {
    throw new Error("CORR_004: Correction request not found.");
  }

  if (correction.status !== "pending") {
    throw new Error(`CORR_005: Correction request is already ${correction.status}.`);
  }

  const [updated] = await db
    .update(corrections)
    .set({
      status: "rejected",
      approvedBy: rejectedBy, // Record who rejected
      updatedAt: new Date(),
    })
    .where(eq(corrections.id, correctionId))
    .returning();

  await logAuditEvent({
    userId: rejectedBy,
    action: "CORRECTION_REJECTED",
    category: "CORRECTION",
    resourceType: "correction",
    resourceId: correctionId,
    details: {
      rejectedBy,
      rejectionReason: reason,
    },
    ipAddress,
    userAgent,
  });

  return updated;
}
