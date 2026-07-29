/**
 * Check-In / Check-Out Attendance Processing Service (FR-014, FR-018–024, Section 7)
 *
 * Implements transaction-safe attendance validation and processing:
 * 1. Scanner duplicate suppression window (5 seconds).
 * 2. Atomic QR token claiming.
 * 3. Employee state & shift boundary checks.
 * 4. Duplicate prevention (ATT_001, ATT_002, ATT_003).
 * 5. Worked duration & late/early-exit calculations in plant timezone.
 * 6. Immutable ledger record append & audit log creation in single DB transaction.
 */

import crypto from "crypto";
import { db } from "../db";
import {
  employees,
  shiftAssignments,
  shifts,
  attendanceEvents,
  attendanceLedger,
  attendanceTokens,
} from "../db/schema";
import { claimAttendanceToken } from "./token-engine";
import { getPlantDateString, getPlantTimeString } from "./timezone";
import { logAuditEvent } from "../audit/logger";
import { recordScanSuccess, recordScanRejection } from "./metrics";
import { eq, and, isNull, desc } from "drizzle-orm";

// Scanner Duplicate Suppression Window (5 seconds)
const scannerSuppressionMap = new Map<string, number>();

export interface AttendanceScanResult {
  success: boolean;
  event?: any;
  ledgerRecord?: any;
  workedSeconds?: number;
  isLate?: boolean;
  isEarlyExit?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export async function processAttendanceScan({
  rawToken,
  scannerUserId,
  ipAddress,
  userAgent,
}: {
  rawToken: string;
  scannerUserId: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AttendanceScanResult> {
  const startTime = Date.now();

  // 1. Refinement #7: Scanner Duplicate Suppression Check (5 seconds window)
  const suppressionKey = `${scannerUserId}:${rawToken}`;
  const lastScanTime = scannerSuppressionMap.get(suppressionKey);
  const nowMs = Date.now();

  if (lastScanTime && nowMs - lastScanTime < 5000) {
    const duration = Date.now() - startTime;
    recordScanRejection("ATT_003", duration);
    return {
      success: false,
      errorCode: "ATT_003",
      errorMessage: "Duplicate scan suppressed within 5-second scanner window.",
    };
  }
  scannerSuppressionMap.set(suppressionKey, nowMs);

  // 2. Claim token atomically (ADR §7)
  const claimResult = await claimAttendanceToken(rawToken);
  if (!claimResult.success) {
    const duration = Date.now() - startTime;
    recordScanRejection(claimResult.errorCode || "ATT_006", duration);
    await logAuditEvent({
      userId: scannerUserId,
      action: "ATTENDANCE_SCAN_REJECTED",
      category: "SECURITY",
      details: { errorCode: claimResult.errorCode, reason: claimResult.errorMessage },
      ipAddress,
      userAgent,
    });
    return {
      success: false,
      errorCode: claimResult.errorCode,
      errorMessage: claimResult.errorMessage,
    };
  }

  const tokenRecord = claimResult.tokenRecord;
  const employeeId = tokenRecord.employeeId;
  const tokenType = tokenRecord.tokenType; // 'check_in' | 'check_out'

  // 3. Retrieve Employee & verify active status (Refinement #1)
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), isNull(employees.deletedAt)),
  });

  if (!employee || employee.status !== "active") {
    const duration = Date.now() - startTime;
    recordScanRejection("ATT_007", duration);
    return {
      success: false,
      errorCode: "ATT_007",
      errorMessage: `Employee state '${employee?.status || "NOT_FOUND"}' prohibits attendance.`,
    };
  }

  // 4. Retrieve Active Shift (ADR §9 — shift_assignments is authoritative)
  const currentAssignment = await db.query.shiftAssignments.findFirst({
    where: and(
      eq(shiftAssignments.employeeId, employeeId),
      isNull(shiftAssignments.effectiveTo)
    ),
    orderBy: [desc(shiftAssignments.effectiveFrom)],
  });

  if (!currentAssignment) {
    const duration = Date.now() - startTime;
    recordScanRejection("ATT_008", duration);
    return {
      success: false,
      errorCode: "ATT_008",
      errorMessage: "No active shift assigned to employee.",
    };
  }

  const activeShift = await db.query.shifts.findFirst({
    where: eq(shifts.id, currentAssignment.shiftId),
  });

  if (!activeShift) {
    const duration = Date.now() - startTime;
    recordScanRejection("ATT_008", duration);
    return {
      success: false,
      errorCode: "ATT_008",
      errorMessage: "Assigned shift template not found.",
    };
  }

  const scanTimestamp = new Date();
  const eventDate = getPlantDateString(scanTimestamp);

  // 5. Transaction-Safe Attendance Validation & Event Commit
  try {
    let resultEvent: any = null;
    let resultLedger: any = null;
    let computedWorkedSeconds = 0;
    let isLateFlag = false;
    let lateSecondsVal = 0;
    let isEarlyExitFlag = false;
    let earlyExitSecondsVal = 0;

    await db.transaction(async (tx) => {
      // 5a. Check for duplicate attendance events on the same day
      const existingEvents = await tx
        .select()
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.employeeId, employeeId),
            eq(attendanceEvents.eventDate, eventDate)
          )
        );

      const existingCheckIn = existingEvents.find((e) => e.eventType === "check_in");
      const existingCheckOut = existingEvents.find((e) => e.eventType === "check_out");

      if (tokenType === "check_in") {
        if (existingCheckIn) {
          throw new Error("ATT_001:Duplicate Check-In on the same date.");
        }
      } else if (tokenType === "check_out") {
        if (!existingCheckIn) {
          throw new Error("ATT_002:Check-out submitted before check-in.");
        }
        if (existingCheckOut) {
          throw new Error("ATT_003:Duplicate Check-Out on the same date.");
        }

        // Calculate worked time from actual check-in timestamp
        const checkInTime = new Date(existingCheckIn.eventTimestamp).getTime();
        const checkOutTime = scanTimestamp.getTime();
        const diffSeconds = Math.max(0, Math.floor((checkOutTime - checkInTime) / 1000));

        // Deduct break duration
        const breakSec = activeShift.breakDurationSeconds || 0;
        computedWorkedSeconds = Math.max(0, diffSeconds - breakSec);
      }

      // 5b. Check shift rules (Late Arrival & Early Exit)
      const plantTimeString = getPlantTimeString(scanTimestamp);
      const [h, m, s] = plantTimeString.split(":").map(Number);
      const scanSecondsFromMidnight = h * 3600 + m * 60 + s;

      const [sh, sm, ss] = activeShift.startTime.split(":").map(Number);
      const shiftStartSeconds = sh * 3600 + sm * 60 + (ss || 0);

      const [eh, em, es] = activeShift.endTime.split(":").map(Number);
      const shiftEndSeconds = eh * 3600 + em * 60 + (es || 0);

      if (tokenType === "check_in") {
        const lateThreshold = shiftStartSeconds + activeShift.lateGraceSeconds;
        if (scanSecondsFromMidnight > lateThreshold) {
          isLateFlag = true;
          lateSecondsVal = scanSecondsFromMidnight - shiftStartSeconds;
        }
      } else if (tokenType === "check_out") {
        const earlyThreshold = shiftEndSeconds - activeShift.earlyExitGraceSeconds;
        if (scanSecondsFromMidnight < earlyThreshold) {
          isEarlyExitFlag = true;
          earlyExitSecondsVal = shiftEndSeconds - scanSecondsFromMidnight;
        }
      }

      // 5c. Insert into attendance_events
      const [insertedEvent] = await tx
        .insert(attendanceEvents)
        .values({
          employeeId,
          eventType: tokenType,
          eventDate,
          eventTimestamp: scanTimestamp,
          tokenId: tokenRecord.id,
          shiftId: activeShift.id,
          validatedBy: scannerUserId,
        })
        .returning();

      resultEvent = insertedEvent;

      // 5d. Compute record hash for tamper detection
      const recordHashPayload = `${insertedEvent.id}:${employeeId}:${tokenType}:${eventDate}:${scanTimestamp.toISOString()}`;
      const recordHash = crypto
        .createHash("sha256")
        .update(recordHashPayload)
        .digest("hex");

      // 5e. Append to attendance_ledger (IMMUTABLE)
      const [insertedLedger] = await tx
        .insert(attendanceLedger)
        .values({
          attendanceEventId: insertedEvent.id,
          employeeId,
          eventType: tokenType,
          eventDate,
          eventTimestamp: scanTimestamp,
          shiftId: activeShift.id,
          workedSeconds: tokenType === "check_out" ? computedWorkedSeconds : null,
          isLate: isLateFlag,
          lateSeconds: lateSecondsVal,
          isEarlyExit: isEarlyExitFlag,
          earlyExitSeconds: earlyExitSecondsVal,
          recordHash,
        })
        .returning();

      resultLedger = insertedLedger;

      // 5f. Audit log inside transaction
      await logAuditEvent({
        userId: scannerUserId,
        action: tokenType === "check_in" ? "ATTENDANCE_CHECK_IN" : "ATTENDANCE_CHECK_OUT",
        category: "ATTENDANCE",
        resourceType: "attendance_event",
        resourceId: insertedEvent.id,
        details: {
          employeeCode: employee.employeeCode,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          eventType: tokenType,
          eventDate,
          workedSeconds: computedWorkedSeconds,
          isLate: isLateFlag,
          isEarlyExit: isEarlyExitFlag,
        },
        ipAddress,
        userAgent,
      });
    });

    const duration = Date.now() - startTime;
    recordScanSuccess(duration);

    return {
      success: true,
      event: resultEvent,
      ledgerRecord: resultLedger,
      workedSeconds: computedWorkedSeconds,
      isLate: isLateFlag,
      isEarlyExit: isEarlyExitFlag,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errMessage = error.message || "";
    let code = "ATT_010";
    let msg = "Unexpected server error during attendance processing.";

    if (errMessage.startsWith("ATT_001")) {
      code = "ATT_001";
      msg = "Duplicate Check-In recorded for today.";
    } else if (errMessage.startsWith("ATT_002")) {
      code = "ATT_002";
      msg = "Check-Out cannot be processed without a prior Check-In.";
    } else if (errMessage.startsWith("ATT_003")) {
      code = "ATT_003";
      msg = "Duplicate Check-Out recorded for today.";
    }

    recordScanRejection(code, duration);

    await logAuditEvent({
      userId: scannerUserId,
      action: "ATTENDANCE_SCAN_REJECTED",
      category: "SECURITY",
      details: { errorCode: code, reason: msg },
      ipAddress,
      userAgent,
    });

    return {
      success: false,
      errorCode: code,
      errorMessage: msg,
    };
  }
}
