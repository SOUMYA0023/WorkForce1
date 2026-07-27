/**
 * Attendance Intelligence Engine (Single Source of Truth)
 *
 * All attendance computations (worked seconds, status classification, late seconds,
 * early exit seconds, and shift compliance) are performed ONLY in this engine.
 * No API routes, UI components, or Export modules re-interpret attendance rules.
 *
 * Time unit: Base unit is integer seconds (ADR §6).
 * Timezone: Evaluated in PLANT_TIMEZONE (default Asia/Kolkata).
 */

import { db } from "../db";
import { attendanceEvents, employees } from "../db/schema";
import { resolveActiveShift } from "../shifts/shift-service";
import { getPlantTimeString, PLANT_TIMEZONE } from "../attendance/timezone";
import { eq, and, isNull } from "drizzle-orm";

export type AttendanceStatus =
  | "present"
  | "absent"
  | "half_day"
  | "late_arrival"
  | "early_exit"
  | "missing_check_in"
  | "missing_check_out";

export interface AttendanceIntelligenceOutput {
  employeeId: string;
  eventDate: string;
  shiftId: string;
  shiftName: string;
  scheduledSeconds: number;
  workedSeconds: number;
  workedMinutes: number;
  workedHours: number;
  breakSeconds: number;
  netWorkedSeconds: number;
  status: AttendanceStatus;
  isLate: boolean;
  lateSeconds: number;
  isEarlyExit: boolean;
  earlyExitSeconds: number;
  checkInTimestamp: Date | null;
  checkOutTimestamp: Date | null;
  sourceEventIds: string[];
}

export async function calculateAttendanceIntelligence({
  employeeId,
  eventDate,
}: {
  employeeId: string;
  eventDate: string;
}): Promise<AttendanceIntelligenceOutput | null> {
  // 1. Resolve Active Shift Assignment
  const shiftResolution = await resolveActiveShift(employeeId, eventDate);
  if (!shiftResolution || !shiftResolution.shift) {
    return null; // No shift assigned
  }

  const shift = shiftResolution.shift;

  // Calculate scheduled shift duration in seconds
  const [sh, sm, ss] = shift.startTime.split(":").map(Number);
  const shiftStartSec = sh * 3600 + sm * 60 + (ss || 0);

  const [eh, em, es] = shift.endTime.split(":").map(Number);
  let shiftEndSec = eh * 3600 + em * 60 + (es || 0);
  if (shiftEndSec <= shiftStartSec) {
    shiftEndSec += 24 * 3600; // Overnight shift handling
  }

  const grossScheduledSeconds = shiftEndSec - shiftStartSec;
  const breakSeconds = shift.breakDurationSeconds || 0;
  const scheduledSeconds = Math.max(0, grossScheduledSeconds - breakSeconds);

  // 2. Fetch raw attendance events for employee and date
  const events = await db.query.attendanceEvents.findMany({
    where: and(
      eq(attendanceEvents.employeeId, employeeId),
      eq(attendanceEvents.eventDate, eventDate)
    ),
  });

  const checkInEvent = events.find((e) => e.eventType === "check_in");
  const checkOutEvent = events.find((e) => e.eventType === "check_out");

  const sourceEventIds = events.map((e) => e.id);
  const checkInTimestamp = checkInEvent ? new Date(checkInEvent.eventTimestamp) : null;
  const checkOutTimestamp = checkOutEvent ? new Date(checkOutEvent.eventTimestamp) : null;

  // 3. Status Classification & Duration Calculations
  let workedSeconds = 0;
  let isLate = false;
  let lateSeconds = 0;
  let isEarlyExit = false;
  let earlyExitSeconds = 0;
  let status: AttendanceStatus = "absent";

  if (!checkInEvent && !checkOutEvent) {
    status = "absent";
  } else if (!checkInEvent && checkOutEvent) {
    status = "missing_check_in";
  } else if (checkInEvent && !checkOutEvent) {
    status = "missing_check_out";

    // Evaluate Late Arrival for check-in
    const plantCheckInTime = getPlantTimeString(checkInTimestamp!);
    const [ch, cm, cs] = plantCheckInTime.split(":").map(Number);
    const checkInSec = ch * 3600 + cm * 60 + (cs || 0);
    const lateThreshold = shiftStartSec + (shift.lateGraceSeconds || 0);

    if (checkInSec > lateThreshold) {
      isLate = true;
      lateSeconds = checkInSec - shiftStartSec;
    }
  } else if (checkInTimestamp && checkOutTimestamp) {
    // Both Check-In and Check-Out present
    const diffMs = checkOutTimestamp.getTime() - checkInTimestamp.getTime();
    const grossWorkedSec = Math.max(0, Math.floor(diffMs / 1000));
    workedSeconds = Math.max(0, grossWorkedSec - breakSeconds);

    // Late Arrival Check
    const plantCheckInTime = getPlantTimeString(checkInTimestamp);
    const [ch, cm, cs] = plantCheckInTime.split(":").map(Number);
    const checkInSec = ch * 3600 + cm * 60 + (cs || 0);
    const lateThreshold = shiftStartSec + (shift.lateGraceSeconds || 0);

    if (checkInSec > lateThreshold) {
      isLate = true;
      lateSeconds = checkInSec - shiftStartSec;
    }

    // Early Exit Check
    const plantCheckOutTime = getPlantTimeString(checkOutTimestamp);
    const [oh, om, os] = plantCheckOutTime.split(":").map(Number);
    let checkOutSec = oh * 3600 + om * 60 + (os || 0);
    if (checkOutSec < checkInSec) {
      checkOutSec += 24 * 3600; // Overnight shift
    }
    const earlyThreshold = shiftEndSec - (shift.earlyExitGraceSeconds || 0);

    if (checkOutSec < earlyThreshold) {
      isEarlyExit = true;
      earlyExitSeconds = shiftEndSec - checkOutSec;
    }

    // Final Status Determination
    if (workedSeconds >= scheduledSeconds * 0.85) {
      status = isLate ? "late_arrival" : isEarlyExit ? "early_exit" : "present";
    } else if (workedSeconds >= scheduledSeconds * 0.4) {
      status = "half_day";
    } else {
      status = "absent";
    }
  }

  const workedMinutes = Math.floor(workedSeconds / 60);
  const workedHours = Number((workedSeconds / 3600).toFixed(2));

  return {
    employeeId,
    eventDate,
    shiftId: shift.id,
    shiftName: shift.name,
    scheduledSeconds,
    workedSeconds,
    workedMinutes,
    workedHours,
    breakSeconds,
    netWorkedSeconds: workedSeconds,
    status,
    isLate,
    lateSeconds,
    isEarlyExit,
    earlyExitSeconds,
    checkInTimestamp,
    checkOutTimestamp,
    sourceEventIds,
  };
}
