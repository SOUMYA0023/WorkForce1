/**
 * Employee Validation Schemas (Refinement #15 & #16)
 *
 * Uses Zod for strict validation of single employee CRUD and bulk import rows.
 */

import { z } from "zod";

export const employeeStatusSchema = z.enum([
  "active",
  "inactive",
  "suspended",
  "terminated",
  "on_leave",
]);

export const createEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .min(3, "Employee code must be at least 3 characters")
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "Code contains invalid characters"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  department: z.string().min(1, "Department is required").max(100),
  designation: z.string().min(1, "Designation is required").max(100),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phoneNumber: z
    .string()
    .regex(/^\+?[0-9\s-]{8,20}$/, "Invalid phone number format")
    .optional()
    .or(z.literal("")),
  status: employeeStatusSchema.default("active"),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
