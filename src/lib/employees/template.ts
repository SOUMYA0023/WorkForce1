/**
 * Downloadable Employee Import Template Generator (Refinement #17)
 *
 * Generates sample CSV / XLSX templates matching the required import schema.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";

export const SAMPLE_EMPLOYEE_DATA = [
  {
    employeeCode: "EMP000001",
    firstName: "Rajesh",
    lastName: "Kumar",
    department: "Operations",
    designation: "Plant Engineer",
    email: "rajesh.kumar@tncoke.com",
    phoneNumber: "+91-9876543210",
    status: "active",
    joinedAt: "2026-01-15",
  },
  {
    employeeCode: "EMP000002",
    firstName: "Priya",
    lastName: "Sharma",
    department: "Quality Assurance",
    designation: "QA Technician",
    email: "priya.sharma@tncoke.com",
    phoneNumber: "+91-9876543211",
    status: "active",
    joinedAt: "2026-02-01",
  },
];

export function generateCsvTemplate(): string {
  return Papa.unparse(SAMPLE_EMPLOYEE_DATA);
}

export function generateXlsxTemplateBuffer(): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_EMPLOYEE_DATA);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
