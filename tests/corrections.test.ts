import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  submitCorrectionRequest,
  approveCorrection,
} from "../src/lib/corrections/corrections-service";
import { getLiveMonitoringStats, getAttendanceExceptions } from "../src/lib/attendance/monitoring-service";
import { db } from "../src/lib/db";
import {
  employees,
  users,
  corrections,
  shifts,
  shiftAssignments,
  attendanceEvents,
  attendanceLedger,
} from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

describe("Phase 4 — Live Monitoring & Correction Workflow Unit & Integration Suite", () => {

  it("Correction #2: Should strictly enforce Segregation of Duties (approver cannot be submitter)", async () => {
    // Attempt approval where submitter == approver
    const mockCorrection = {
      id: "corr-123-abc",
      employeeId: "emp-100",
      correctedBy: "user-admin-1", // Submitter
      status: "pending",
    };

    vi.spyOn(db.query.corrections, "findFirst").mockResolvedValue(mockCorrection as any);

    await expect(
      approveCorrection({
        correctionId: "corr-123-abc",
        approvedBy: "user-admin-1", // Same user attempting approval
        approverRole: "admin",
      })
    ).rejects.toThrow("CORR_002: Segregation of duties violation: Submitter cannot approve their own correction request.");
  });

  it("Correction #3: Should restrict submission permissions to admin/super_admin/hr_payroll", async () => {
    await expect(
      submitCorrectionRequest({
        employeeId: "emp-100",
        correctedBy: "user-gate-op",
        submitterRole: "gate_operator", // Forbidden submitter
        correctionType: "manual_check_in",
        correctedTimestamp: new Date(),
        reason: "Valid reason",
      })
    ).rejects.toThrow("CORR_003: Insufficient permissions to submit attendance correction.");
  });

  it("Correction #1: Should require mandatory reason capture for correction submission", async () => {
    await expect(
      submitCorrectionRequest({
        employeeId: "emp-100",
        correctedBy: "user-admin-1",
        submitterRole: "admin",
        correctionType: "manual_check_in",
        correctedTimestamp: new Date(),
        reason: "   ", // Empty reason
      })
    ).rejects.toThrow("CORR_001: Mandatory reason capture required for attendance correction.");
  });

  it("Correction #7: Should cache live monitoring stats with 3.5s TTL", async () => {
    vi.spyOn(db, "select").mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{ count: 15 }]),
      }),
    } as any);

    vi.spyOn(db, "execute").mockResolvedValue([{ count: 2 }] as any);

    const stats1 = await getLiveMonitoringStats("2026-07-29");
    const stats2 = await getLiveMonitoringStats("2026-07-29");

    // Exact match of cachedAt timestamp verifies in-memory 3.5s cache hit
    expect(stats1.cachedAt).toBe(stats2.cachedAt);
  });
});
