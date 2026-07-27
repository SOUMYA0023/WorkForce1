/**
 * Role-Based Access Control Matrix (UR-001 to UR-005, SR-004)
 *
 * Roles & Permissions:
 * - super_admin: Full access to all features, settings, users, and data.
 * - admin: Attendance oversight, employee master data, shift management, reports.
 * - gate_operator: Attendance scanning & live monitoring dashboard only.
 * - hr_payroll: Employee master data, payroll export, attendance reports.
 * - employee: View personal profile, personal attendance, personal QR token.
 */

export type UserRole =
  | "super_admin"
  | "admin"
  | "gate_operator"
  | "hr_payroll"
  | "employee";

export const PERMISSIONS = {
  // Employee management permissions
  EMPLOYEE_VIEW: ["super_admin", "admin", "hr_payroll"] as UserRole[],
  EMPLOYEE_CREATE: ["super_admin", "admin"] as UserRole[],
  EMPLOYEE_UPDATE: ["super_admin", "admin"] as UserRole[],
  EMPLOYEE_DELETE: ["super_admin"] as UserRole[],
  EMPLOYEE_IMPORT: ["super_admin", "admin", "hr_payroll"] as UserRole[],

  // Attendance & Scanning permissions
  ATTENDANCE_SCAN: ["super_admin", "admin", "gate_operator"] as UserRole[],
  LIVE_MONITORING: ["super_admin", "admin", "gate_operator"] as UserRole[],

  // Shift permissions
  SHIFT_MANAGE: ["super_admin", "admin"] as UserRole[],
  SHIFT_ASSIGN: ["super_admin", "admin"] as UserRole[],

  // Payroll permissions
  PAYROLL_VIEW_EXPORT: ["super_admin", "admin", "hr_payroll"] as UserRole[],
  PAYROLL_CALCULATE: ["super_admin", "admin", "hr_payroll"] as UserRole[],

  // System & Audit permissions
  AUDIT_LOG_VIEW: ["super_admin", "admin"] as UserRole[],
  SYSTEM_CONFIG_MANAGE: ["super_admin"] as UserRole[],
};

export function hasRole(userRole: string, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole as UserRole);
}

export function canPerformAction(userRole: string, action: keyof typeof PERMISSIONS): boolean {
  const allowed = PERMISSIONS[action];
  if (!allowed) return false;
  return allowed.includes(userRole as UserRole);
}
