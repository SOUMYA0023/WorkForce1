/**
 * Format-Only Export Engine (Refinement #7)
 *
 * Strictly serializes pre-calculated payroll and attendance data.
 * Zero business logic, calculations, or status interpretations exist in this module.
 * Formats: CSV (`papaparse`) and Excel XLSX (`xlsx`).
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface AttendanceExportRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  date: string;
  shiftName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  workedHours: string;
  lateSeconds: number;
  earlyExitSeconds: number;
}

export interface PayrollExportRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  periodDate: string;
  shiftName: string;
  scheduledHours: string;
  actualWorkedHours: string;
  overtimeHours: string;
  undertimeHours: string;
  lateArrivalMinutes: number;
  isFinalized: string;
}

/**
 * Exports Attendance Rows to CSV string.
 */
export function exportAttendanceToCsv(rows: AttendanceExportRow[]): string {
  return Papa.unparse(rows);
}

/**
 * Exports Attendance Rows to Excel XLSX binary Buffer.
 */
export function exportAttendanceToXlsx(rows: AttendanceExportRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Log");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/**
 * Exports Payroll Rows to CSV string.
 */
export function exportPayrollToCsv(rows: PayrollExportRow[]): string {
  return Papa.unparse(rows);
}

/**
 * Exports Payroll Rows to Excel XLSX binary Buffer.
 */
export function exportPayrollToXlsx(rows: PayrollExportRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll Summary");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
