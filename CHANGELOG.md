# Changelog — WorkForce One

All notable changes to the **WorkForce One** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.3.0] - 2026-07-27

### Phase 3 – Attendance Intelligence, Shift Management & Payroll/Overtime Engine

#### Added
- **Shift Engine (`src/lib/shifts/shift-service.ts`)**:
  - Shift template CRUD (name, start/end times, break seconds, late/early exit grace periods, overtime thresholds).
  - Employee shift assignment management (`shift_assignments` table).
  - Active shift resolution (`resolveActiveShift`) implementing ADR §9 (`shift_assignments` as authoritative source).
- **Attendance Intelligence Engine (`src/lib/intelligence/attendance-calculator.ts`)**:
  - **Single Source of Truth** for all attendance status and worked time computations.
  - Base unit: Integer seconds (ADR §6); evaluated in `PLANT_TIMEZONE` (`Asia/Kolkata`).
  - Status classification: `present`, `absent`, `half_day`, `late_arrival`, `early_exit`, `missing_check_in`, `missing_check_out`.
- **Overtime Engine (`src/lib/overtime/overtime-calculator.ts`)**:
  - Consumes outputs from Attendance Intelligence Engine.
  - Evaluates overtime eligibility and calculates precise `overtimeSeconds` and `undertimeSeconds` without rounding.
- **Payroll Engine (`src/lib/payroll/payroll-service.ts`)**:
  - Generates time-based daily records in `payroll_records` (integer seconds per ADR §6 — no currency columns).
  - **Explainable Calculation Trace**: Generates audit trace detailing source event IDs, shift template ID, plant timezone, policy snapshot, and worked time math (`explainPayrollCalculationTrace`).
  - Recalculates payroll records upon attendance correction approval (ADR §8).
- **Format-Only Export Engine (`src/lib/export/export-service.ts`)**:
  - Format-only serialization to CSV (`papaparse`) and Excel XLSX (`xlsx`). Zero business recalculation in export code.
- **Standardized API v1 Endpoints**:
  - `/api/v1/shifts` (GET/POST)
  - `/api/v1/shifts/assignments` (POST)
  - `/api/v1/payroll` (GET/POST)
  - `/api/v1/payroll/explain/[id]` (GET)
  - `/api/v1/export/payroll` (GET)
- **Administrative UI Pages**:
  - `/shifts`: Shift Templates & Employee Shift Assignment Manager.
  - `/payroll`: Daily Payroll Records Dashboard with summary metric cards, explainable calculation trace modal, and CSV/XLSX export controls.
- **Integration Test Suite**: `tests/intelligence.test.ts` verifying end-to-end Shift → Intelligence → Overtime → Payroll → Export pipeline.

---

## [v0.2.0] - 2026-07-27

### Phase 2 – Authentication, RBAC & Secure QR Attendance Core

#### Added
- **Cryptographic QR Token Engine**: Server-side 256-bit random entropy payload generation (`crypto.randomBytes(32)`) hashed with SHA-256 (`src/lib/attendance/token-engine.ts`).
- **Single Active Token Invalidation**: Generating a new QR token automatically invalidates any previously active unconsumed token for that employee and token type (`check_in` / `check_out`).
- **Atomic Token Claiming**: Single-use atomic `UPDATE attendance_tokens SET is_consumed = true... RETURNING *` (ADR §7) eliminating TOCTOU race conditions.
- **Transaction-Safe Attendance Service**: Single DB transaction wrapping token claim, employee lifecycle state validation (`active`), shift assignment lookup, duplicate prevention (`ATT_001`–`ATT_003`), event creation, immutable ledger append, and audit logging (`src/lib/attendance/check-in-out.ts`).
- **Plant Timezone Standardization**: Timestamps stored in UTC; plant date & shift calculations computed using configured plant timezone (`PLANT_TIMEZONE`, default `Asia/Kolkata`) (`src/lib/attendance/timezone.ts`).
- **Scanner Duplicate Suppression Window**: 5-second suppression window preventing accidental double-scans.
- **Standardized Attendance Error Codes**: Added `ATT_001` to `ATT_010`.
- **Observability Metrics**: Operational metrics tracker (`src/lib/attendance/metrics.ts`).
- **Dedicated Security Documentation**: [`SECURITY.md`](./SECURITY.md).
- **Dynamic Employee QR UI**: `/my-qr` page with 15s auto-refresh.
- **Gate Operator Scanner UI**: `/scanner` page.

---

## [v0.1.0] - 2026-07-27

### Phase 1 – Technical Architecture, Stack Setup & Employee Master Data
- Initialized Next.js 14 App Router, NextAuth credentials, 14 Drizzle tables, bcryptjs hashing, account lockout, 5-role RBAC, extended audit logging, employee master data with soft deletion, and bulk spreadsheet import engine.
