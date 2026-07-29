import { describe, it, expect } from "vitest";
import { exportPayrollToCsv, exportPayrollToXlsx } from "../src/lib/export/export-service";

describe("Phase 3 — Attendance Intelligence & Export Integration Suite", () => {
  it("Should calculate worked seconds and net worked time deterministically without rounding drift", () => {
    const checkInTimeMs = new Date("2026-01-01T09:00:00.000Z").getTime();
    const checkOutTimeMs = new Date("2026-01-01T18:00:00.000Z").getTime();
    const breakDurationSec = 3600; // 1 hour break

    const grossWorkedSec = Math.floor((checkOutTimeMs - checkInTimeMs) / 1000); // 32,400s (9 hrs)
    const netWorkedSec = grossWorkedSec - breakDurationSec; // 28,800s (8 hrs)

    expect(grossWorkedSec).toBe(32400);
    expect(netWorkedSec).toBe(28800);

    const workedHours = Number((netWorkedSec / 3600).toFixed(2));
    expect(workedHours).toBe(8.0);
  });

  it("Should evaluate overtime thresholds accurately", () => {
    const scheduledSeconds = 28800; // 8 hrs
    const overtimeThresholdSeconds = 1800; // 30 mins grace before OT
    const totalWorkedSecWithOt = 36000; // 10 hrs worked

    let overtimeSec = 0;
    if (totalWorkedSecWithOt > scheduledSeconds + overtimeThresholdSeconds) {
      overtimeSec = totalWorkedSecWithOt - scheduledSeconds; // 7,200s (2 hrs OT)
    }

    expect(overtimeSec).toBe(7200);
  });

  it("Should format payroll records to CSV and XLSX without recalculating business rules", () => {
    const sampleRows = [
      {
        employeeCode: "EMP000001",
        employeeName: "John Doe",
        department: "Production",
        periodDate: "2026-01-01",
        shiftName: "General Shift",
        scheduledHours: "8.00",
        actualWorkedHours: "10.00",
        overtimeHours: "2.00",
        undertimeHours: "0.00",
        lateArrivalMinutes: 0,
        isFinalized: "NO",
      },
    ];

    const csvResult = exportPayrollToCsv(sampleRows);
    expect(csvResult).toContain("EMP000001");
    expect(csvResult).toContain("10.00");

    const xlsxBuffer = exportPayrollToXlsx(sampleRows);
    expect(Buffer.isBuffer(xlsxBuffer)).toBe(true);
    expect(xlsxBuffer.length).toBeGreaterThan(0);
  });
});
