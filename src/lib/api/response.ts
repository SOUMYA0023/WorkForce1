/**
 * Standardized API Response & Error Codes (Refinement #14)
 *
 * All API routes under /api/v1/... return JSON formatted as:
 * Success: { success: true, data: T, meta?: Record<string, any> }
 * Failure: { success: false, error: { code: string, message: string, details?: any } }
 */

import { NextResponse } from "next/server";

export const ERROR_CODES = {
  // Auth Errors
  AUTH_001: "Invalid credentials.",
  AUTH_002: "Account is temporarily locked due to multiple failed login attempts.",
  AUTH_003: "Authentication required or session expired.",
  AUTH_004: "Forbidden. Insufficient role permissions for this operation.",
  AUTH_005: "Employee account is not active.",

  // Employee Errors
  EMP_001: "Employee not found.",
  EMP_002: "Duplicate entry. Employee code, email, or phone number already exists.",
  EMP_003: "Employee status prevents this action.",
  EMP_004: "Invalid employee import file or missing required headers.",
  EMP_005: "Validation error on employee data.",

  // System & Rate Limiting Errors
  SYS_001: "Too many requests. Please try again later.",
  SYS_002: "Internal server error.",
  SYS_003: "Invalid request payload.",
} as const;

export type ErrorCodeKey = keyof typeof ERROR_CODES;

export function apiSuccess<T>(data: T, meta?: Record<string, any>, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
    },
    { status }
  );
}

export function apiError(
  code: ErrorCodeKey,
  customMessage?: string,
  details?: any,
  status = 400
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message: customMessage || ERROR_CODES[code],
        ...(details ? { details } : {}),
      },
    },
    { status }
  );
}
