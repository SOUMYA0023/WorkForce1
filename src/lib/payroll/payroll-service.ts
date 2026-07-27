/**
 * Payroll Engine (FR-029 to FR-034, ADR §6, ADR §8)
 *
 * Responsibilities:
 * 1. Consumes validated outputs from Intelligence & Overtime engines.
 * 2. Generates daily time-based payroll records in `payroll_records` (integer seconds per ADR §6 — no currency columns).
 * 3. Generates explainable calculation trace metadata for audits.
 * 4. Provides `recalculatePayrollRecord` handler triggered when an attendance correction is approved (ADR §8).
 */

import { db } from "../db";
import { payrollRecords } from "../db/schema";
import { calculateAttendanceIntelligence } from "../intelligence/attendance-calculator";
import { calculateOvertime } from "../overtime/overtime-calculator";
import { PLANT_TIMEZONE } from "../attendance/timezone";
import { logAuditEvent } from "../audit/logger";
import { eq, and } from "drizzle-orm";

export interface CalculationTrace {
  payrollRecordId: string;
  employeeId: string;
  periodDate: string;
  shiftId: string;
  plantTimezone: string;
  policySnapshot: {
    baseUnit: "seconds";
    overtimeThresholdSeconds: number;
  };
  sourceEventIds: string[];
  checkInTimestamp: string | null;
  checkOutTimestamp: string | null;
  scheduledSeconds: number;
  actualWorkedSeconds: number;
  breakSeconds: number;
  netWorkedSeconds: number;
  overtimeSeconds: number;
  undertimeSeconds: number;
  lateArrivalSeconds: number;
  earlyExitSeconds: number;
  status: string;
  isFinalized: boolean;
}

export async function processDailyPayrollRecord({
  employeeId,
  periodDate,
  actorUserId,
}: {
  employeeId: string;
  periodDate: string;
  actorUserId?: string;
}) {
  // 1. Run Attendance Intelligence Engine (Single Source of Truth)
  const intelligence = await calculateAttendanceIntelligence({ employeeId, eventDate: periodDate });
  if (!intelligence || !intelligence.checkInTimestamp || !intelligence.checkOutTimestamp) {
    return null; // Incomplete check-in/out for payroll record
  }

  // 2. Run Overtime Engine
  const overtimeResult = await calculateOvertime(intelligence);

  // 3. Check for existing payroll record for employee & periodDate
  const existing = await db.query.payrollRecords.findFirst({
    where: and(
      eq(payrollRecords.employeeId, employeeId),
      eq(payrollRecords.periodDate, periodDate)
    ),
  });

  let record: any = null;

  if (existing) {
    // Upsert / Update existing
    const [updated] = await db
      .update(payrollRecords)
      .set({
        shiftId: intelligence.shiftId,
        checkInTimestamp: intelligence.checkInTimestamp,
        checkOutTimestamp: intelligence.checkOutTimestamp,
        scheduledSeconds: intelligence.scheduledSeconds,
        actualWorkedSeconds: intelligence.workedSeconds,
        breakSeconds: intelligence.breakSeconds,
        netWorkedSeconds: intelligence.netWorkedSeconds,
        overtimeSeconds: overtimeResult.overtimeSeconds,
        undertimeSeconds: overtimeResult.undertimeSeconds,
        lateArrivalSeconds: intelligence.lateSeconds,
        earlyExitSeconds: intelligence.earlyExitSeconds,
        updatedAt: new Date(),
      })
      .where(eq(payrollRecords.id, existing.id))
      .returning();

    record = updated;
  } else {
    // Insert new
    const [inserted] = await db
      .insert(payrollRecords)
      .values({
        employeeId,
        periodDate,
        shiftId: intelligence.shiftId,
        checkInTimestamp: intelligence.checkInTimestamp,
        checkOutTimestamp: intelligence.checkOutTimestamp,
        scheduledSeconds: intelligence.scheduledSeconds,
        actualWorkedSeconds: intelligence.workedSeconds,
        breakSeconds: intelligence.breakSeconds,
        netWorkedSeconds: intelligence.netWorkedSeconds,
        overtimeSeconds: overtimeResult.overtimeSeconds,
        undertimeSeconds: overtimeResult.undertimeSeconds,
        lateArrivalSeconds: intelligence.lateSeconds,
        earlyExitSeconds: intelligence.earlyExitSeconds,
        isFinalized: false,
      })
      .returning();

    record = inserted;
  }

  if (actorUserId) {
    await logAuditEvent({
      userId: actorUserId,
      action: "PAYROLL_RECORD_PROCESSED",
      category: "PAYROLL",
      resourceType: "payroll_record",
      resourceId: record.id,
      details: {
        employeeId,
        periodDate,
        netWorkedSeconds: record.netWorkedSeconds,
        overtimeSeconds: record.overtimeSeconds,
      },
    });
  }

  return record;
}

/**
 * Returns explainable calculation trace for audit inspections (Refinement #3).
 */
export async function explainPayrollCalculationTrace(
  payrollRecordId: string
): Promise<CalculationTrace | null> {
  const record = await db.query.payrollRecords.findFirst({
    where: eq(payrollRecords.id, payrollRecordId),
  });

  if (!record) return null;

  const intelligence = await calculateAttendanceIntelligence({
    employeeId: record.employeeId,
    eventDate: record.periodDate,
  });

  return {
    payrollRecordId: record.id,
    employeeId: record.employeeId,
    periodDate: record.periodDate,
    shiftId: record.shiftId,
    plantTimezone: PLANT_TIMEZONE,
    policySnapshot: {
      baseUnit: "seconds",
      overtimeThresholdSeconds: intelligence ? 0 : 0,
    },
    sourceEventIds: intelligence?.sourceEventIds || [],
    checkInTimestamp: record.checkInTimestamp ? new Date(record.checkInTimestamp).toISOString() : null,
    checkOutTimestamp: record.checkOutTimestamp ? new Date(record.checkOutTimestamp).toISOString() : null,
    scheduledSeconds: record.scheduledSeconds,
    actualWorkedSeconds: record.actualWorkedSeconds,
    breakSeconds: record.breakSeconds,
    netWorkedSeconds: record.netWorkedSeconds,
    overtimeSeconds: record.overtimeSeconds,
    undertimeSeconds: record.undertimeSeconds,
    lateArrivalSeconds: record.lateArrivalSeconds,
    earlyExitSeconds: record.earlyExitSeconds,
    status: intelligence?.status || "present",
    isFinalized: record.isFinalized,
  };
}

/**
 * Recalculates payroll when an attendance correction is approved (ADR §8).
 * If `isFinalized === true`, un-finalizes record, re-computes, and logs audit event.
 */
export async function recalculatePayrollForCorrection({
  employeeId,
  periodDate,
  correctionId,
  approvedByUserId,
}: {
  employeeId: string;
  periodDate: string;
  correctionId: string;
  approvedByUserId: string;
}) {
  const existing = await db.query.payrollRecords.findFirst({
    where: and(
      eq(payrollRecords.employeeId, employeeId),
      eq(payrollRecords.periodDate, periodDate)
    ),
  });

  // If finalized, un-finalize (ADR §8)
  if (existing && existing.isFinalized) {
    await db
      .update(payrollRecords)
      .set({ isFinalized: false })
      .where(eq(payrollRecords.id, existing.id));

    await logAuditEvent({
      userId: approvedByUserId,
      action: "PAYROLL_UNFINALIZED_FOR_CORRECTION",
      category: "PAYROLL",
      resourceType: "payroll_record",
      resourceId: existing.id,
      details: { correctionId, reason: "Correction approved for finalized period" },
    });
  }

  // Re-run payroll calculation
  const updatedRecord = await processDailyPayrollRecord({
    employeeId,
    periodDate,
    actorUserId: approvedByUserId,
  });

  return updatedRecord;
}
