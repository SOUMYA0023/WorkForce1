/**
 * Employee Bulk Import Engine (Refinements #8, #9, #10, #15)
 *
 * Capabilities:
 * - File parsing: Supports CSV and XLSX files.
 * - Dry-Run Mode (isDryRun): Validates data and returns row-level error report without writing to DB.
 * - Partial Import: Valid rows are imported while invalid rows are skipped and reported individually.
 * - Database Transactions: Import operation + batch metadata persistence + audit logging run inside a single DB transaction.
 * - Metadata Tracking: Stores file name, records summary, and report in `import_batches` table.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { db } from "../db";
import { employees, importBatches } from "../db/schema";
import { createEmployeeSchema } from "./validation";
import { inArray, eq } from "drizzle-orm";
import { logAuditEvent } from "../audit/logger";

export interface RowValidationError {
  rowNumber: number;
  employeeCode?: string;
  field?: string;
  message: string;
}

export interface ImportEngineResult {
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  skippedRecords: number;
  isDryRun: boolean;
  batchId?: string;
  errors: RowValidationError[];
  importedCodes: string[];
}

export async function processEmployeeImport({
  buffer,
  filename,
  fileType,
  uploadedByUserId,
  isDryRun = false,
}: {
  buffer: Buffer;
  filename: string;
  fileType: "csv" | "xlsx";
  uploadedByUserId: string;
  isDryRun?: boolean;
}): Promise<ImportEngineResult> {
  let rawRows: any[] = [];

  if (fileType === "csv") {
    const csvContent = buffer.toString("utf-8");
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    rawRows = parsed.data;
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    rawRows = XLSX.utils.sheet_to_json(worksheet);
  }

  const totalRecords = rawRows.length;
  const errors: RowValidationError[] = [];
  const validRowsToInsert: any[] = [];
  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  // Fetch existing employee codes, emails, phones to check uniqueness
  const existingEmployees = await db
    .select({
      code: employees.employeeCode,
      email: employees.email,
      phone: employees.phoneNumber,
    })
    .from(employees)
    .where(eq(employees.deletedAt, null as any));

  const dbCodes = new Set(existingEmployees.map((e) => e.code.toUpperCase()));
  const dbEmails = new Set(
    existingEmployees
      .filter((e) => e.email)
      .map((e) => e.email!.toLowerCase())
  );
  const dbPhones = new Set(
    existingEmployees.filter((e) => e.phone).map((e) => e.phone!)
  );

  // Validate each row individually (Partial import support)
  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 1;
    const raw = rawRows[i];

    // Normalize field names
    const rowData = {
      employeeCode: String(raw.employeeCode || raw["Employee Code"] || raw["employee_code"] || "").trim(),
      firstName: String(raw.firstName || raw["First Name"] || raw["first_name"] || "").trim(),
      lastName: String(raw.lastName || raw["Last Name"] || raw["last_name"] || "").trim(),
      department: String(raw.department || raw["Department"] || "").trim(),
      designation: String(raw.designation || raw["Designation"] || "").trim(),
      email: raw.email || raw["Email"] ? String(raw.email || raw["Email"]).trim().toLowerCase() : undefined,
      phoneNumber: raw.phoneNumber || raw["Phone"] || raw["Phone Number"] ? String(raw.phoneNumber || raw["Phone"] || raw["Phone Number"]).trim() : undefined,
      status: String(raw.status || raw["Status"] || "active").toLowerCase().trim(),
      joinedAt: String(raw.joinedAt || raw["Joined Date"] || raw["joined_at"] || "").trim(),
    };

    // Zod schema check
    const validation = createEmployeeSchema.safeParse(rowData);
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        errors.push({
          rowNumber: rowNum,
          employeeCode: rowData.employeeCode,
          field: issue.path.join("."),
          message: issue.message,
        });
      }
      continue;
    }

    const validData = validation.data;
    const upperCode = validData.employeeCode.toUpperCase();

    // Check code uniqueness within file and DB
    if (seenCodes.has(upperCode) || dbCodes.has(upperCode)) {
      errors.push({
        rowNumber: rowNum,
        employeeCode: validData.employeeCode,
        field: "employeeCode",
        message: `Duplicate employee code '${validData.employeeCode}'.`,
      });
      continue;
    }

    // Check email uniqueness if provided
    if (validData.email) {
      const lowerEmail = validData.email.toLowerCase();
      if (seenEmails.has(lowerEmail) || dbEmails.has(lowerEmail)) {
        errors.push({
          rowNumber: rowNum,
          employeeCode: validData.employeeCode,
          field: "email",
          message: `Duplicate email '${validData.email}'.`,
        });
        continue;
      }
      seenEmails.add(lowerEmail);
    }

    // Check phone uniqueness if provided
    if (validData.phoneNumber) {
      if (seenPhones.has(validData.phoneNumber) || dbPhones.has(validData.phoneNumber)) {
        errors.push({
          rowNumber: rowNum,
          employeeCode: validData.employeeCode,
          field: "phoneNumber",
          message: `Duplicate phone number '${validData.phoneNumber}'.`,
        });
        continue;
      }
      seenPhones.add(validData.phoneNumber);
    }

    seenCodes.add(upperCode);
    validRowsToInsert.push({
      employeeCode: validData.employeeCode,
      firstName: validData.firstName,
      lastName: validData.lastName,
      department: validData.department,
      designation: validData.designation,
      email: validData.email || null,
      phoneNumber: validData.phoneNumber || null,
      status: validData.status,
      joinedAt: validData.joinedAt,
    });
  }

  const failedRecords = errors.length;
  const successfulRecords = validRowsToInsert.length;
  const skippedRecords = totalRecords - successfulRecords;

  // DRY-RUN MODE: Return validation report without DB mutations
  if (isDryRun) {
    return {
      totalRecords,
      successfulRecords,
      failedRecords,
      skippedRecords,
      isDryRun: true,
      errors,
      importedCodes: validRowsToInsert.map((r) => r.employeeCode),
    };
  }

  // NON-DRY RUN MODE: Execute insertion & batch record inside DB transaction
  let batchId = "";
  await db.transaction(async (tx) => {
    if (validRowsToInsert.length > 0) {
      await tx.insert(employees).values(validRowsToInsert);
    }

    const [batchRecord] = await tx
      .insert(importBatches)
      .values({
        filename,
        totalRecords,
        successfulRecords,
        failedRecords,
        skippedRecords,
        isDryRun: false,
        validationReport: { errors },
        uploadedBy: uploadedByUserId,
      })
      .returning();

    batchId = batchRecord.id;

    // Audit log
    await logAuditEvent({
      userId: uploadedByUserId,
      action: "EMPLOYEE_BULK_IMPORT",
      category: "EMPLOYEE",
      resourceType: "import_batch",
      resourceId: batchId,
      details: {
        filename,
        totalRecords,
        successfulRecords,
        failedRecords,
        skippedRecords,
      },
    });
  });

  return {
    totalRecords,
    successfulRecords,
    failedRecords,
    skippedRecords,
    isDryRun: false,
    batchId,
    errors,
    importedCodes: validRowsToInsert.map((r) => r.employeeCode),
  };
}
