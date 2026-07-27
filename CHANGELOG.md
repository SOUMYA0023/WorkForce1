# Changelog — WorkForce One

All notable changes to the **WorkForce One** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.2.0] - 2026-07-27

### Phase 2 – Authentication, RBAC & Secure QR Attendance Core

#### Added
- **Cryptographic QR Token Engine**: Server-side 256-bit random entropy payload generation (`crypto.randomBytes(32)`) hashed with SHA-256 (`src/lib/attendance/token-engine.ts`).
- **Single Active Token Invalidation**: Generating a new QR token automatically invalidates any previously active unconsumed token for that employee and token type (`check_in` / `check_out`), preventing multiple simultaneously active tokens per employee.
- **Atomic Token Claiming**: Single-use atomic `UPDATE attendance_tokens SET is_consumed = true... RETURNING *` (ADR §7) eliminating TOCTOU race conditions.
- **Transaction-Safe Attendance Service**: Single DB transaction wrapping token claim, employee lifecycle state validation (`active`), shift assignment lookup, duplicate prevention (`ATT_001`–`ATT_003`), event creation, immutable ledger append, and audit logging (`src/lib/attendance/check-in-out.ts`).
- **Plant Timezone Standardization**: Timestamps stored in UTC; plant date & shift calculations computed using configured plant timezone (`PLANT_TIMEZONE`, default `Asia/Kolkata`) (`src/lib/attendance/timezone.ts`).
- **Shift Boundary & Policy Validation**: Late arrival grace period and early exit grace period calculation against assigned shift templates in `system_config`.
- **Scanner Duplicate Suppression Window**: 5-second suppression window preventing accidental double-scans from rapid hardware scanner triggers or operator double-clicks.
- **Standardized Attendance Error Codes**: Added `ATT_001` to `ATT_010` across API responses, audit logs, and metrics (`src/lib/api/response.ts`).
- **Observability Metrics**: Operational metrics tracker (`src/lib/attendance/metrics.ts`) recording tokens generated, scans succeeded, scans rejected by code, and average scan duration.
- **Dedicated Security Documentation**: Complete security architecture blueprint created in [`SECURITY.md`](./SECURITY.md) detailing threat model, single-use semantics, anti-replay defenses, rate limits, and audit policies.
- **Dynamic Employee QR UI**: `/my-qr` page featuring auto-refreshing QR code (every 15s), interactive countdown progress bar, and mode toggle (`Check-In` / `Check-Out`).
- **Gate Operator Scanner UI**: `/scanner` page featuring live barcode/camera input, audio/visual scan feedback (Green success / Red error with `ATT_...` code), and live session history feed.
- **Unit & Verification Tests**: Added unit test assertions (`tests/token-engine.test.ts`) verifying SHA-256 payload determinism and variance.

#### Security
- Strict session authentication (`HTTP 401`) and RBAC authorization (`HTTP 403`) enforced across all API v1 endpoints (`/api/v1/attendance/*`, `/api/v1/employees/*`).
- Middleware updated (`src/middleware.ts`) to protect dashboard UI routes (`/employees`, `/scanner`, `/my-qr`).

---

## [v0.1.0] - 2026-07-27

### Phase 1 – Technical Architecture, Stack Setup & Employee Master Data

#### Added
- **Project Foundation**: Next.js 14 App Router with TypeScript initialized (`workforce-one/`).
- **Database Schema**: 14 PostgreSQL tables defined via Drizzle ORM (`users`, `employees`, `shifts`, `shift_assignments`, `attendance_tokens`, `attendance_events`, `attendance_ledger`, `payroll_records`, `audit_logs`, `corrections`, `system_config`, `sessions`, `accounts`, `verification_tokens`).
- **NextAuth & Database Sessions**: Credentials Provider with database session strategy (`sessions` table) for server-side session revocation (ADR §3).
- **Password Security**: Cryptographic password hashing via `bcryptjs` (12 salt rounds, SR-007) + password complexity validator (12+ chars, upper, lower, number, special char).
- **Account Lockout**: 5 consecutive failed login attempts trigger a 15-minute temporary account lockout (`src/lib/auth/lockout.ts`).
- **Role-Based Access Control (RBAC)**: Permission matrix (`src/lib/auth/rbac.ts`) for 5 roles: `super_admin`, `admin`, `gate_operator`, `hr_payroll`, `employee`.
- **Extended Audit Logging**: Immutable append-only logger (`src/lib/audit/logger.ts`) capturing IP address, user agent, browser, OS, user ID, timestamp, and details JSON.
- **Employee Master Data & Lifecycle**: Rich status lifecycle (`active`, `inactive`, `suspended`, `terminated`, `on_leave`) + soft deletion (`deletedAt`, `deletedBy`).
- **Bulk Spreadsheet Import Engine**: CSV & XLSX parser supporting Dry-Run mode (`?dryRun=true`), partial imports, database transactions, batch metadata logging (`import_batches`), and downloadable sample templates.
- **Standardized API v1**: `/api/v1/...` route structure with structured JSON error responses (`AUTH_001`, `EMP_004`, `SYS_001`).
- **Administrative UI**: Login page (`/login`) and Employee Dashboard (`/employees`) with metric cards, search/filters, single create modal, and bulk import modal.
- **Architecture Decision Record**: Full ADR with 10 architecture decisions in [`docs/adr/001-architecture-decisions.md`](./docs/adr/001-architecture-decisions.md).
