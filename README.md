# WorkForce One — Enterprise Attendance & Payroll Engine

[![Release](https://img.shields.io/badge/version-v0.2.0-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#license)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14_App_Router-black)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_Self--Hosted-blue)](https://www.postgresql.org/)

**WorkForce One** is a commercial-grade, high-throughput workforce attendance management system engineered for industrial manufacturing facilities. Built under a strict **Server-Authority (Zero Client Trust)** model, it prevents proxy attendance, QR screenshot reuse, and replay attacks while scaling efficiently for ~15,000 employees on a low-cost VPS.

Designed for **Tamil Nadu Coke and Power Private Limited** (v1.0 Baseline).

---

## 🌟 Key Features

- **Cryptographic Anti-Fraud QR Engine**: 256-bit random entropy payload hashed with SHA-256 (`tokenHash`). 30-second token lifetime with 15-second dynamic auto-refresh.
- **Single Active Token per Action**: Refreshing a QR code automatically invalidates previous unconsumed active tokens for that employee and action.
- **Single-Use Atomic Claims**: Anti-replay token consumption via PostgreSQL atomic `UPDATE...RETURNING` (ADR §7) eliminating TOCTOU race conditions.
- **Transaction-Safe Attendance Processing**: Single DB transaction wrapping token claim, employee status check (`active`), shift lookup (`shift_assignments`), duplicate prevention, worked time calculation, immutable ledger append (`attendance_ledger`), and audit logging.
- **Plant Timezone Standardization**: All DB timestamps stored in UTC (`timestamp with time zone`); plant date and shift boundaries evaluated in `PLANT_TIMEZONE` (`Asia/Kolkata`).
- **5-Role RBAC System**: Granular permission guards for `super_admin`, `admin`, `gate_operator`, `hr_payroll`, and `employee`.
- **Bulk Spreadsheet Import Engine**: High-speed CSV/XLSX parser with Dry-Run mode (`?dryRun=true`), partial import support, row-level validation reports, and batch metadata tracking (`import_batches`).
- **Account Lockout & Security**: 5 failed login attempts trigger a 15-minute lockout + 12+ char password complexity enforcer (`bcryptjs` 12 rounds).
- **Immutable Audit Trail**: Append-only logging (`audit_logs`) capturing IP address, user agent, browser, OS, user ID, timestamp, and details JSON.
- **Standardized Error Codes**: Consistent `ATT_001`–`ATT_010`, `AUTH_001`–`005`, and `EMP_001`–`005` error codes across all API endpoints.

---

## 📐 Enterprise Architecture Overview

For full architectural blueprints, ER diagrams, request flow diagrams, and sequence diagrams, inspect [`ARCHITECTURE.md`](./ARCHITECTURE.md).

```
Browser / Gate Scanner ──► Next.js 14 App Router ──► RBAC Matrix ──► Domain Services ──► Drizzle ORM ──► PostgreSQL 16
```

---

## 📑 PRD Traceability Verification Matrix (FR-001 to FR-024)

| Requirement ID | PRD Requirement Description | Implemented Module | Status | Source File Reference | Verification Method |
|----------------|-----------------------------|--------------------|--------|-----------------------|---------------------|
| **FR-001** | Secure credential-based login | Auth Module | **IMPLEMENTED** | [`src/lib/auth/config.ts`](./src/lib/auth/config.ts) | NextAuth Credentials Provider Test |
| **FR-002** | 5 User Role Definitions | RBAC Module | **IMPLEMENTED** | [`src/lib/db/schema/users.ts`](./src/lib/db/schema/users.ts) | Schema `userRoleEnum` Verification |
| **FR-003** | Route & Action RBAC Enforcement | RBAC Guard | **IMPLEMENTED** | [`src/lib/auth/rbac.ts`](./src/lib/auth/rbac.ts) | API Guard & Middleware Verification |
| **FR-004** | Configurable Session Expiration | Session Engine | **IMPLEMENTED** | [`src/lib/auth/config.ts`](./src/lib/auth/config.ts#L23) | `SESSION_TIMEOUT_MINUTES` Check |
| **FR-005** | Authentication Audit Logging | Audit Logger | **IMPLEMENTED** | [`src/lib/audit/logger.ts`](./src/lib/audit/logger.ts) | `audit_logs` Table Inspection |
| **FR-006** | Spreadsheet Bulk Employee Import | Import Engine | **IMPLEMENTED** | [`src/lib/employees/import-engine.ts`](./src/lib/employees/import-engine.ts) | Dry-Run & Partial Import Test |
| **FR-007** | Employee Master Data Schema | DB Schema | **IMPLEMENTED** | [`src/lib/db/schema/employees.ts`](./src/lib/db/schema/employees.ts) | Column & Enum Verification |
| **FR-008** | Employee Search & Filtering | Employee API | **IMPLEMENTED** | [`src/app/api/v1/employees/route.ts`](./src/app/api/v1/employees/route.ts) | Search Query Parameter Test |
| **FR-009** | Employee Single CRUD & Status | Employee API | **IMPLEMENTED** | [`src/app/api/v1/employees/[id]/route.ts`](./src/app/api/v1/employees/[id]/route.ts) | POST, PATCH, DELETE Soft-Delete Test |
| **FR-010** | Dynamic QR Generation | Token Engine | **IMPLEMENTED** | [`src/lib/attendance/token-engine.ts`](./src/lib/attendance/token-engine.ts) | `generateAttendanceToken()` Test |
| **FR-011** | Dynamic Auto-Refresh (15s) | Employee UI | **IMPLEMENTED** | [`src/app/(dashboard)/my-qr/page.tsx`](./src/app/(dashboard)/my-qr/page.tsx) | UI Timer & Refresh Verification |
| **FR-012** | QR Expiry Policy (30s) | Token Engine | **IMPLEMENTED** | [`src/lib/attendance/token-engine.ts`](./src/lib/attendance/token-engine.ts#L22) | Expiry Timestamp Inspection |
| **FR-013** | Cryptographic QR Payload | Token Engine | **IMPLEMENTED** | [`src/lib/attendance/token-engine.ts`](./src/lib/attendance/token-engine.ts#L61) | 256-bit SHA-256 Hash Test |
| **FR-014** | Single-Use QR Claiming | Token Engine | **IMPLEMENTED** | [`src/lib/attendance/token-engine.ts`](./src/lib/attendance/token-engine.ts#L107) | Atomic `UPDATE...RETURNING` Test |
| **FR-015** | Replay & Duplicate Rejection | Attendance Service | **IMPLEMENTED** | [`src/lib/attendance/check-in-out.ts`](./src/lib/attendance/check-in-out.ts#L170) | `ATT_001` / `ATT_005` Rejection Test |
| **FR-016** | Offline Screenshot Rejection | Token Engine | **IMPLEMENTED** | [`src/lib/attendance/token-engine.ts`](./src/lib/attendance/token-engine.ts#L107) | Expired Token Claim Test |
| **FR-017** | Token Lifecycle Audit Trail | Audit Logger | **IMPLEMENTED** | [`src/lib/attendance/check-in-out.ts`](./src/lib/attendance/check-in-out.ts#L236) | Audit Event Log Verification |
| **FR-018** | Precise Event Timestamping | Attendance Service | **IMPLEMENTED** | [`src/lib/attendance/check-in-out.ts`](./src/lib/attendance/check-in-out.ts#L145) | UTC Storage & Plant Time Test |
| **FR-019** | Check-In Event Recording | Attendance Service | **IMPLEMENTED** | [`src/lib/attendance/check-in-out.ts`](./src/lib/attendance/check-in-out.ts#L209) | `attendance_events` Table Test |
| **FR-020** | Check-Out & Worked Calculation | Attendance Service | **IMPLEMENTED** | [`src/lib/attendance/check-in-out.ts`](./src/lib/attendance/check-in-out.ts#L192) | Worked Seconds Math Test |
| **FR-021** | Late Arrival Flagging | Attendance Service | **IMPLEMENTED** | [`src/lib/attendance/check-in-out.ts`](./src/lib/attendance/check-in-out.ts#L200) | Shift Start Margin Test |
| **FR-022** | Early Exit Flagging | Attendance Service | **IMPLEMENTED** | [`src/lib/attendance/check-in-out.ts`](./src/lib/attendance/check-in-out.ts#L205) | Shift End Margin Test |
| **FR-023** | Immutable Attendance Ledger | DB Schema | **IMPLEMENTED** | [`src/lib/db/schema/attendance.ts`](./src/lib/db/schema/attendance.ts#L110) | `attendance_ledger` Append Test |
| **FR-024** | Attendance Corrections Tracking | DB Schema | **IMPLEMENTED** | [`src/lib/db/schema/corrections.ts`](./src/lib/db/schema/corrections.ts) | `corrections` Schema Verification |

---

## 🛠️ Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.0 (Strict Type-Safety)
- **Database**: PostgreSQL 16 (Self-Hosted via `pg` Pool)
- **ORM**: Drizzle ORM & Drizzle Kit
- **Authentication**: NextAuth (Auth.js v5) with Credentials & Session strategy
- **Cryptography**: `crypto` (SHA-256) & `bcryptjs` (12 rounds)
- **Spreadsheet Parser**: `papaparse` & `xlsx`
- **QR Code Engine**: `qrcode`

---

## 📂 Project Directory Structure

```
workforce-one/
├── ARCHITECTURE.md          # Enterprise Architecture Blueprint & Mermaid Diagrams
├── CHANGELOG.md             # Semantic version history (v0.1.0, v0.2.0)
├── ROADMAP.md               # Product roadmap (Phases 0-8)
├── SECURITY.md              # Security policies & threat model
├── drizzle.config.ts        # Drizzle ORM configuration
├── drizzle/                 # Generated PostgreSQL SQL migrations
├── src/
│   ├── app/
│   │   ├── (auth)/login/    # Employee & Admin Login View
│   │   ├── (dashboard)/
│   │   │   ├── employees/   # Employee Master Data Dashboard
│   │   │   ├── my-qr/       # Employee Dynamic QR Code Page
│   │   │   └── scanner/     # Gate Operator Scanner Page
│   │   ├── api/v1/          # Standardized API v1 Routes
│   │   │   ├── auth/        # Auth Login Route
│   │   │   ├── employees/   # Employee CRUD, Bulk Import, Stats, Template
│   │   │   └── attendance/  # QR Generation, Scan, History Routes
│   │   └── globals.css      # Enterprise CSS Theme
│   ├── auth.ts              # NextAuth v5 helper
│   ├── middleware.ts        # Route authentication guard middleware
│   └── lib/
│       ├── api/             # Response formatter & sliding rate limiter
│       ├── audit/           # Extended append-only audit logger
│       ├── auth/            # Password policy, lockout manager, RBAC matrix, NextAuth config
│       ├── db/              # PostgreSQL Drizzle database client & 15 schema tables
│       └── employees/       # Validation schemas, template generator & bulk import engine
└── tests/                   # Token engine & assertion test suites
```

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js >= 18.x
- PostgreSQL >= 15.x

### 1. Installation
```bash
git clone https://github.com/SOUMYA0023/WorkForce1.git
cd WorkForce1/workforce-one
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env.local` and set database credentials:
```bash
cp .env.example .env.local
```

Example `.env.local`:
```env
DATABASE_URL=postgresql://workforce_user:password@localhost:5432/workforce_one
NEXTAUTH_SECRET=your-32-character-secret
NEXTAUTH_URL=http://localhost:3000
PLANT_TIMEZONE=Asia/Kolkata
```

### 3. Generate Database Migrations & Seed
```bash
npx drizzle-kit generate
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000/login](http://localhost:3000/login) in your browser.

---

## 🧪 Testing & Verification

Run TypeScript compilation check:
```bash
npx tsc --noEmit
```

Run Token Engine Unit Tests:
```bash
npx tsx tests/token-engine.test.ts
```

---

## 📜 License

Proprietary Software — Developed for **Tamil Nadu Coke and Power Private Limited**. All rights reserved.

**Author**: Soumya Suman Kar
