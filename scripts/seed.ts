/**
 * WorkForce One — Localhost Database Seeding Script (v0.3.0)
 *
 * Populates realistic test data across all 15 tables:
 * - 5 Role Accounts (super_admin, admin, gate_operator, hr_payroll, employee)
 * - 3 Employee Master Profiles (active status)
 * - Industrial Shift Templates & Employee Shift Assignments
 * - Attendance Events & Append-Only Ledger Entries
 * - Daily Payroll Records & Explainable Traces
 * - Audit Log Entries
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import {
  users,
  employees,
  shifts,
  shiftAssignments,
  attendanceTokens,
  attendanceEvents,
  attendanceLedger,
  payrollRecords,
} from "../src/lib/db/schema";
import { hashTokenPayload } from "../src/lib/attendance/token-engine";
import { processDailyPayrollRecord } from "../src/lib/payroll/payroll-service";
import { getPlantDateString } from "../src/lib/attendance/timezone";

export async function seedLocalhostDatabase() {
  console.log("🌱 Seeding WorkForce One Localhost Database...");

  const saltRounds = 12;
  const todayStr = getPlantDateString();

  // 1. Create Employees
  console.log("Creating employee master data...");
  const [emp1] = await db
    .insert(employees)
    .values({
      employeeCode: "EMP000001",
      firstName: "John",
      lastName: "Doe",
      department: "Production & Coke Operations",
      designation: "Plant Shift Engineer",
      email: "employee@workforce1.com",
      phoneNumber: "+919876543210",
      status: "active",
      joinedAt: "2026-01-01",
    })
    .onConflictDoNothing()
    .returning();

  const [emp2] = await db
    .insert(employees)
    .values({
      employeeCode: "EMP000002",
      firstName: "Jane",
      lastName: "Smith",
      department: "Quality Assurance",
      designation: "Senior QA Analyst",
      email: "jane.smith@workforce1.com",
      phoneNumber: "+919876543211",
      status: "active",
      joinedAt: "2026-01-01",
    })
    .onConflictDoNothing()
    .returning();

  // Fetch created employee records if returning empty due to conflict
  const actualEmp1 = emp1 || (await db.query.employees.findFirst({ where: (e, { eq }) => eq(e.employeeCode, "EMP000001") }));
  const actualEmp2 = emp2 || (await db.query.employees.findFirst({ where: (e, { eq }) => eq(e.employeeCode, "EMP000002") }));

  // 2. Create User Accounts for all 5 Roles
  console.log("Creating 5 role user accounts...");
  const superAdminHash = await bcrypt.hash("SuperAdmin@1234", saltRounds);
  const adminHash = await bcrypt.hash("AdminPass@1234", saltRounds);
  const gateOpHash = await bcrypt.hash("GateOpPass@1234", saltRounds);
  const hrPayrollHash = await bcrypt.hash("HrPayroll@1234", saltRounds);
  const employeeHash = await bcrypt.hash("EmployeePass@1234", saltRounds);

  await db
    .insert(users)
    .values({
      email: "superadmin@workforce1.com",
      passwordHash: superAdminHash,
      role: "super_admin",
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({
      email: "admin@workforce1.com",
      passwordHash: adminHash,
      role: "admin",
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({
      email: "operator@workforce1.com",
      passwordHash: gateOpHash,
      role: "gate_operator",
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({
      email: "payroll@workforce1.com",
      passwordHash: hrPayrollHash,
      role: "hr_payroll",
      isActive: true,
    })
    .onConflictDoNothing();

  if (actualEmp1) {
    await db
      .insert(users)
      .values({
        email: "employee@workforce1.com",
        passwordHash: employeeHash,
        role: "employee",
        employeeId: actualEmp1.id,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  const adminUser = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, "admin@workforce1.com") });
  const gateOpUser = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, "operator@workforce1.com") });

  // 3. Create Shift Templates
  console.log("Creating shift templates...");
  const [shift1] = await db
    .insert(shifts)
    .values({
      name: "General Morning Shift (09:00 - 18:00)",
      startTime: "09:00:00",
      endTime: "18:00:00",
      breakDurationSeconds: 3600, // 1 hr break
      lateGraceSeconds: 600, // 10 mins
      earlyExitGraceSeconds: 600, // 10 mins
      overtimeThresholdSeconds: 1800, // 30 mins
      isActive: true,
    })
    .onConflictDoNothing()
    .returning();

  const actualShift1 = shift1 || (await db.query.shifts.findFirst());

  // 4. Create Shift Assignments
  console.log("Creating shift assignments...");
  if (actualEmp1 && actualShift1 && adminUser) {
    await db
      .insert(shiftAssignments)
      .values({
        employeeId: actualEmp1.id,
        shiftId: actualShift1.id,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        assignedBy: adminUser.id,
      })
      .onConflictDoNothing();
  }

  if (actualEmp2 && actualShift1 && adminUser) {
    await db
      .insert(shiftAssignments)
      .values({
        employeeId: actualEmp2.id,
        shiftId: actualShift1.id,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        assignedBy: adminUser.id,
      })
      .onConflictDoNothing();
  }

  // 5. Create Attendance Tokens & Events
  console.log("Creating attendance tokens, events & ledger records...");
  if (actualEmp1 && actualShift1 && gateOpUser) {
    const checkInTime = new Date(`${todayStr}T08:55:00.000Z`);
    const checkOutTime = new Date(`${todayStr}T18:05:00.000Z`);

    // Insert Check-In Token
    const [token1] = await db
      .insert(attendanceTokens)
      .values({
        employeeId: actualEmp1.id,
        tokenHash: hashTokenPayload(`seed_checkin_token_${Date.now()}`),
        tokenType: "check_in",
        generatedAt: checkInTime,
        expiresAt: new Date(checkInTime.getTime() + 30000),
        consumedAt: checkInTime,
        isConsumed: true,
      })
      .returning();

    // Insert Check-Out Token
    const [token2] = await db
      .insert(attendanceTokens)
      .values({
        employeeId: actualEmp1.id,
        tokenHash: hashTokenPayload(`seed_checkout_token_${Date.now()}`),
        tokenType: "check_out",
        generatedAt: checkOutTime,
        expiresAt: new Date(checkOutTime.getTime() + 30000),
        consumedAt: checkOutTime,
        isConsumed: true,
      })
      .returning();

    if (token1) {
      const [checkInEvt] = await db
        .insert(attendanceEvents)
        .values({
          employeeId: actualEmp1.id,
          eventType: "check_in",
          eventDate: todayStr,
          eventTimestamp: checkInTime,
          tokenId: token1.id,
          shiftId: actualShift1.id,
          validatedBy: gateOpUser.id,
        })
        .onConflictDoNothing()
        .returning();

      if (checkInEvt) {
        await db
          .insert(attendanceLedger)
          .values({
            attendanceEventId: checkInEvt.id,
            employeeId: actualEmp1.id,
            eventType: "check_in",
            eventDate: todayStr,
            eventTimestamp: checkInTime,
            shiftId: actualShift1.id,
            workedSeconds: 0,
            isLate: false,
            lateSeconds: 0,
            isEarlyExit: false,
            earlyExitSeconds: 0,
            recordHash: hashTokenPayload(`${checkInEvt.id}:check_in`),
          })
          .onConflictDoNothing();
      }
    }

    if (token2) {
      const [checkOutEvt] = await db
        .insert(attendanceEvents)
        .values({
          employeeId: actualEmp1.id,
          eventType: "check_out",
          eventDate: todayStr,
          eventTimestamp: checkOutTime,
          tokenId: token2.id,
          shiftId: actualShift1.id,
          validatedBy: gateOpUser.id,
        })
        .onConflictDoNothing()
        .returning();

      if (checkOutEvt) {
        await db
          .insert(attendanceLedger)
          .values({
            attendanceEventId: checkOutEvt.id,
            employeeId: actualEmp1.id,
            eventType: "check_out",
            eventDate: todayStr,
            eventTimestamp: checkOutTime,
            shiftId: actualShift1.id,
            workedSeconds: 28800,
            isLate: false,
            lateSeconds: 0,
            isEarlyExit: false,
            earlyExitSeconds: 0,
            recordHash: hashTokenPayload(`${checkOutEvt.id}:check_out`),
          })
          .onConflictDoNothing();
      }
    }

    // 6. Generate Daily Payroll Record
    console.log("Generating daily payroll record via Payroll Engine...");
    await processDailyPayrollRecord({
      employeeId: actualEmp1.id,
      periodDate: todayStr,
      actorUserId: adminUser?.id,
    });
  }

  console.log("✅ Localhost database seeding complete!");
}

if (require.main === module) {
  seedLocalhostDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("SEED_ERROR:", err);
      process.exit(1);
    });
}
