/**
 * Shift Engine (FR-025 to FR-028, ADR §9)
 *
 * Responsible for:
 * 1. Shift Template CRUD (name, startTime, endTime, breakDurationSeconds, lateGraceSeconds, earlyExitGraceSeconds, overtimeThresholdSeconds)
 * 2. Employee Shift Assignment history management
 * 3. Active Shift Resolution (`resolveActiveShift`):
 *    Determines an employee's active shift for a given date from `shift_assignments`.
 *    Implements ADR §9 — `shift_assignments` is the single authoritative source of truth.
 */

import { db } from "../db";
import { shifts, shiftAssignments } from "../db/schema";
import { eq, and, isNull, lte, gte, or, desc } from "drizzle-orm";
import { logAuditEvent } from "../audit/logger";

export interface CreateShiftInput {
  name: string;
  startTime: string; // HH:mm:ss format
  endTime: string; // HH:mm:ss format
  breakDurationSeconds?: number;
  lateGraceSeconds?: number;
  earlyExitGraceSeconds?: number;
  overtimeThresholdSeconds?: number;
}

export interface AssignShiftInput {
  employeeId: string;
  shiftId: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD (null = ongoing assignment)
  assignedBy: string;
}

export async function createShiftTemplate(data: CreateShiftInput, creatorUserId?: string) {
  const [inserted] = await db
    .insert(shifts)
    .values({
      name: data.name,
      startTime: data.startTime,
      endTime: data.endTime,
      breakDurationSeconds: data.breakDurationSeconds || 0,
      lateGraceSeconds: data.lateGraceSeconds ?? 600, // 10 min default
      earlyExitGraceSeconds: data.earlyExitGraceSeconds ?? 600, // 10 min default
      overtimeThresholdSeconds: data.overtimeThresholdSeconds || 0,
      isActive: true,
    })
    .returning();

  if (creatorUserId) {
    await logAuditEvent({
      userId: creatorUserId,
      action: "SHIFT_TEMPLATE_CREATED",
      category: "SHIFT",
      resourceType: "shift",
      resourceId: inserted.id,
      details: { name: inserted.name, startTime: inserted.startTime, endTime: inserted.endTime },
    });
  }

  return inserted;
}

export async function listShifts() {
  return db.select().from(shifts).orderBy(shifts.name);
}

export async function assignShiftToEmployee(input: AssignShiftInput) {
  // If setting a new ongoing assignment (effectiveTo is null),
  // close out any existing active assignment for this employee
  if (!input.effectiveTo) {
    const nowStr = input.effectiveFrom;
    await db
      .update(shiftAssignments)
      .set({ effectiveTo: nowStr })
      .where(
        and(
          eq(shiftAssignments.employeeId, input.employeeId),
          isNull(shiftAssignments.effectiveTo)
        )
      );
  }

  const [assignment] = await db
    .insert(shiftAssignments)
    .values({
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo || null,
      assignedBy: input.assignedBy,
    })
    .returning();

  await logAuditEvent({
    userId: input.assignedBy,
    action: "SHIFT_ASSIGNED",
    category: "SHIFT",
    resourceType: "shift_assignment",
    resourceId: assignment.id,
    details: {
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    },
  });

  return assignment;
}

/**
 * Resolves the active shift template for an employee on a specific date (YYYY-MM-DD).
 * Authoritative lookup per ADR §9.
 */
export async function resolveActiveShift(employeeId: string, eventDate: string) {
  const assignment = await db.query.shiftAssignments.findFirst({
    where: and(
      eq(shiftAssignments.employeeId, employeeId),
      lte(shiftAssignments.effectiveFrom, eventDate),
      or(
        isNull(shiftAssignments.effectiveTo),
        gte(shiftAssignments.effectiveTo, eventDate)
      )
    ),
    orderBy: [desc(shiftAssignments.effectiveFrom)],
  });

  if (!assignment) {
    return null;
  }

  const shiftTemplate = await db.query.shifts.findFirst({
    where: eq(shifts.id, assignment.shiftId),
  });

  return {
    assignment,
    shift: shiftTemplate || null,
  };
}
