/**
 * Phase 1 — Auth, RBAC & Employee Import Validation Test Suite
 *
 * Covers:
 * 1. RBAC canPerformAction: rejection of unauthenticated (no role) request.
 * 2. RBAC canPerformAction: rejection of insufficient-role request.
 * 3. RBAC canPerformAction: acceptance of correctly-scoped request.
 * 4. Employee bulk-import Zod validation: malformed row rejection with clear field-level error.
 * 5. Employee bulk-import Zod validation: valid row acceptance.
 */

import { describe, it, expect } from "vitest";
import { canPerformAction, hasRole, PERMISSIONS } from "../src/lib/auth/rbac";
import { createEmployeeSchema } from "../src/lib/employees/validation";

describe("Phase 1 — Auth, RBAC & Employee Import Validation", () => {
  // ── RBAC Tests ────────────────────────────────────────────────────────

  it("RBAC #1: Should reject an unauthenticated request (empty-string role denies all actions)", () => {
    // An unauthenticated user has no role. Passing "" simulates this.
    expect(canPerformAction("", "EMPLOYEE_VIEW")).toBe(false);
    expect(canPerformAction("", "EMPLOYEE_CREATE")).toBe(false);
    expect(canPerformAction("", "ATTENDANCE_SCAN")).toBe(false);
    expect(canPerformAction("", "PAYROLL_VIEW_EXPORT")).toBe(false);
    expect(canPerformAction("", "SYSTEM_CONFIG_MANAGE")).toBe(false);
  });

  it("RBAC #2: Should reject a request with an insufficient role", () => {
    // Employee role cannot manage employees
    expect(canPerformAction("employee", "EMPLOYEE_CREATE")).toBe(false);
    expect(canPerformAction("employee", "EMPLOYEE_DELETE")).toBe(false);
    expect(canPerformAction("employee", "EMPLOYEE_IMPORT")).toBe(false);

    // Gate operator cannot manage shifts or view payroll
    expect(canPerformAction("gate_operator", "SHIFT_MANAGE")).toBe(false);
    expect(canPerformAction("gate_operator", "PAYROLL_VIEW_EXPORT")).toBe(false);
    expect(canPerformAction("gate_operator", "EMPLOYEE_CREATE")).toBe(false);

    // HR/Payroll cannot delete employees or manage system config
    expect(canPerformAction("hr_payroll", "EMPLOYEE_DELETE")).toBe(false);
    expect(canPerformAction("hr_payroll", "SYSTEM_CONFIG_MANAGE")).toBe(false);

    // Admin cannot manage system config (super_admin only)
    expect(canPerformAction("admin", "SYSTEM_CONFIG_MANAGE")).toBe(false);
  });

  it("RBAC #3: Should accept correctly-scoped requests for each role", () => {
    // super_admin has full access
    expect(canPerformAction("super_admin", "EMPLOYEE_VIEW")).toBe(true);
    expect(canPerformAction("super_admin", "EMPLOYEE_CREATE")).toBe(true);
    expect(canPerformAction("super_admin", "EMPLOYEE_DELETE")).toBe(true);
    expect(canPerformAction("super_admin", "SYSTEM_CONFIG_MANAGE")).toBe(true);
    expect(canPerformAction("super_admin", "PAYROLL_CALCULATE")).toBe(true);

    // admin can do attendance oversight and employee management
    expect(canPerformAction("admin", "EMPLOYEE_VIEW")).toBe(true);
    expect(canPerformAction("admin", "EMPLOYEE_CREATE")).toBe(true);
    expect(canPerformAction("admin", "ATTENDANCE_SCAN")).toBe(true);
    expect(canPerformAction("admin", "SHIFT_MANAGE")).toBe(true);

    // gate_operator can scan and monitor
    expect(canPerformAction("gate_operator", "ATTENDANCE_SCAN")).toBe(true);
    expect(canPerformAction("gate_operator", "LIVE_MONITORING")).toBe(true);

    // hr_payroll can view employees and manage payroll
    expect(canPerformAction("hr_payroll", "EMPLOYEE_VIEW")).toBe(true);
    expect(canPerformAction("hr_payroll", "EMPLOYEE_IMPORT")).toBe(true);
    expect(canPerformAction("hr_payroll", "PAYROLL_VIEW_EXPORT")).toBe(true);
    expect(canPerformAction("hr_payroll", "PAYROLL_CALCULATE")).toBe(true);
  });

  it("RBAC #4: hasRole should validate role membership accurately", () => {
    expect(hasRole("admin", ["super_admin", "admin"])).toBe(true);
    expect(hasRole("employee", ["super_admin", "admin"])).toBe(false);
    expect(hasRole("gate_operator", ["gate_operator"])).toBe(true);
  });

  // ── Employee Import Validation Tests ──────────────────────────────────

  it("Import #1: Should reject a malformed row with clear field-level errors", () => {
    const malformedRow = {
      employeeCode: "",         // Too short (min 3)
      firstName: "",            // Required
      lastName: "",             // Required
      department: "",           // Required
      designation: "",          // Required
      email: "not-an-email",    // Invalid email format
      phoneNumber: "abc",       // Invalid phone format
      status: "active",
      joinedAt: "invalid-date", // Bad date format
    };

    const result = createEmployeeSchema.safeParse(malformedRow);

    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;

      // Each invalid field should produce a clear error
      expect(fieldErrors.employeeCode).toBeDefined();
      expect(fieldErrors.employeeCode!.length).toBeGreaterThan(0);

      expect(fieldErrors.firstName).toBeDefined();
      expect(fieldErrors.firstName!.length).toBeGreaterThan(0);

      expect(fieldErrors.lastName).toBeDefined();
      expect(fieldErrors.department).toBeDefined();
      expect(fieldErrors.designation).toBeDefined();
      expect(fieldErrors.email).toBeDefined();
      expect(fieldErrors.phoneNumber).toBeDefined();
      expect(fieldErrors.joinedAt).toBeDefined();
    }
  });

  it("Import #2: Should reject an employee code with special characters", () => {
    const badCode = {
      employeeCode: "EMP@#$001",
      firstName: "John",
      lastName: "Doe",
      department: "Engineering",
      designation: "Developer",
      status: "active",
      joinedAt: "2026-01-15",
    };

    const result = createEmployeeSchema.safeParse(badCode);
    expect(result.success).toBe(false);
    if (!result.success) {
      const codeErrors = result.error.flatten().fieldErrors.employeeCode;
      expect(codeErrors).toBeDefined();
      expect(codeErrors!.some((e) => e.includes("invalid characters"))).toBe(true);
    }
  });

  it("Import #3: Should accept a fully valid employee row", () => {
    const validRow = {
      employeeCode: "EMP-001",
      firstName: "Jane",
      lastName: "Smith",
      department: "Production",
      designation: "Operator",
      email: "jane.smith@example.com",
      phoneNumber: "+91 9876543210",
      status: "active",
      joinedAt: "2026-03-01",
    };

    const result = createEmployeeSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employeeCode).toBe("EMP-001");
      expect(result.data.firstName).toBe("Jane");
      expect(result.data.status).toBe("active");
    }
  });

  it("Import #4: Should default status to 'active' when not provided", () => {
    const rowWithoutStatus = {
      employeeCode: "EMP-002",
      firstName: "Bob",
      lastName: "Jones",
      department: "HR",
      designation: "Manager",
      joinedAt: "2026-01-01",
    };

    const result = createEmployeeSchema.safeParse(rowWithoutStatus);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });
});
