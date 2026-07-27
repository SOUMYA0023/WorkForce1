/**
 * Overtime Engine
 *
 * Consumes outputs from Attendance Intelligence Engine.
 * Computes exact overtimeSeconds and undertimeSeconds without rounding.
 * Base unit: Integer seconds (ADR §6).
 */

import { AttendanceIntelligenceOutput } from "../intelligence/attendance-calculator";
import { shifts } from "../db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export interface OvertimeEngineOutput {
  employeeId: string;
  eventDate: string;
  isEligibleForOvertime: boolean;
  overtimeThresholdSeconds: number;
  overtimeSeconds: number;
  overtimeMinutes: number;
  overtimeHours: number;
  undertimeSeconds: number;
  undertimeMinutes: number;
  undertimeHours: number;
}

export async function calculateOvertime(
  intelligence: AttendanceIntelligenceOutput
): Promise<OvertimeEngineOutput> {
  const shiftTemplate = await db.query.shifts.findFirst({
    where: eq(shifts.id, intelligence.shiftId),
  });

  const overtimeThresholdSeconds = shiftTemplate?.overtimeThresholdSeconds || 0;
  const scheduledSeconds = intelligence.scheduledSeconds;
  const netWorkedSeconds = intelligence.netWorkedSeconds;

  let overtimeSeconds = 0;
  let undertimeSeconds = 0;

  // Overtime is calculated for hours worked beyond (scheduledSeconds + overtimeThresholdSeconds)
  const totalThreshold = scheduledSeconds + overtimeThresholdSeconds;
  if (netWorkedSeconds > totalThreshold) {
    overtimeSeconds = netWorkedSeconds - scheduledSeconds;
  } else if (netWorkedSeconds < scheduledSeconds) {
    undertimeSeconds = scheduledSeconds - netWorkedSeconds;
  }

  const overtimeMinutes = Math.floor(overtimeSeconds / 60);
  const overtimeHours = Number((overtimeSeconds / 3600).toFixed(2));

  const undertimeMinutes = Math.floor(undertimeSeconds / 60);
  const undertimeHours = Number((undertimeSeconds / 3600).toFixed(2));

  return {
    employeeId: intelligence.employeeId,
    eventDate: intelligence.eventDate,
    isEligibleForOvertime: overtimeThresholdSeconds >= 0,
    overtimeThresholdSeconds,
    overtimeSeconds,
    overtimeMinutes,
    overtimeHours,
    undertimeSeconds,
    undertimeMinutes,
    undertimeHours,
  };
}
