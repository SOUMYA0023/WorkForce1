# Product Roadmap — WorkForce One

**WorkForce One** Enterprise Workforce Attendance Management & Payroll Engine  
Target Platform: Version 1 Commercial SaaS Baseline (`v0.3.0`)  

---

## Completed Phases (Baseline Frozen)

### ✅ Phase 0 — Technical Architecture & Database Schema
- Locked 14 core database tables via Drizzle ORM.
- Configured self-hosted PostgreSQL (ADR §1).
- Published initial Architecture Decision Records (ADR 001).

### ✅ Phase 1 — Authentication, RBAC & Employee Master Data (`v0.1.0`)
- Credential login via NextAuth + Database Session management.
- 5-Role RBAC permission matrix (`super_admin`, `admin`, `gate_operator`, `hr_payroll`, `employee`).
- Rich employee status lifecycle (`active`, `inactive`, `suspended`, `terminated`, `on_leave`).
- Soft deletion (`deletedAt`, `deletedBy`).
- Bulk Spreadsheet Import Engine (CSV & XLSX with Dry-Run mode).

### ✅ Phase 2 — QR Token Engine & Check-In/Check-Out Core (`v0.2.0`)
- Server-authority QR token engine (256-bit entropy payload, SHA-256 token hashing).
- Single active token per action & single-use atomic claims (`UPDATE...RETURNING`).
- Transaction-safe check-in/out with duplicate prevention (`ATT_001`–`ATT_003`).
- Plant timezone standardization (`PLANT_TIMEZONE=Asia/Kolkata`).
- Observability metrics & dedicated [`SECURITY.md`](./SECURITY.md).
- Dynamic Employee QR View (`/my-qr`) & Gate Operator Scanner View (`/scanner`).

### ✅ Phase 3 — Attendance Intelligence, Shift Management & Payroll/Overtime Engine (`v0.3.0`)
- **Shift Engine (`src/lib/shifts/`)**: Template CRUD, shift assignments, and active shift resolution (`resolveActiveShift` per ADR §9).
- **Attendance Intelligence Engine (`src/lib/intelligence/`)**: Single source of truth for worked seconds math, status classification (`present`, `absent`, `half_day`, `late_arrival`, `early_exit`, `missing_check_in`, `missing_check_out`), and shift compliance using `PLANT_TIMEZONE`.
- **Overtime Engine (`src/lib/overtime/`)**: Evaluates overtime eligibility and precise overtime/undertime seconds without intermediate rounding (ADR §6).
- **Payroll Engine (`src/lib/payroll/`)**: Daily payroll record generation (`payroll_records`), explainable calculation trace generator (`explainPayrollCalculationTrace`), and correction-triggered recalculation handler (ADR §8).
- **Format-Only Export Engine (`src/lib/export/`)**: Serializes pre-computed payroll and attendance to CSV (`papaparse`) and XLSX (`xlsx`) with zero business recalculation.
- **UI Pages**: Shift Template Manager (`/shifts`) and Daily Payroll Dashboard (`/payroll`) with explainable calculation trace modal.
- **Integration Test Suite**: `tests/intelligence.test.ts` verifying end-to-end pipeline.

---

## Future Phase Roadmap

```
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Phase 4   │ ──► │   Phase 5   │ ──► │   Phase 6   │ ──► │   Phase 7   │
  │ Live Monitoring│    │ Advanced    │     │ Mobile PWA  │     │ Deployment  │
  │ & Exceptions│     │ Analytics   │     │ & Scanner   │     │ & Monitoring│
  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

### ⬜ Phase 4 — Live Attendance Dashboard & Exception Workflow
- Real-time gate attendance monitoring dashboard with near real-time polling (ADR §10).
- Gate operator live feed displaying check-ins/outs in real time.
- Attendance exception queue (missing check-out, unassigned shift, late arrival).
- Authorized attendance correction workflow (`corrections` table) with mandatory reason capture and admin approval.

### ⬜ Phase 5 — Advanced Analytics & Enterprise Reporting
- Overtime & undertime summary reports by department and designation.
- High-speed CSV/XLSX export for downstream enterprise ERP software integration.
- Audit trail reporting for compliance audits (FR-047).

### ⬜ Phase 6 — Mobile QR App & Gate Scanner PWA
- Camera-based QR code scanner stream (`html5-qrcode`) for gate operators.
- Offline-resilient PWA manifest & service worker for employee QR display.

### ⬜ Phase 7 — Production Deployment, Backups & Monitoring
- Docker containerization (`Dockerfile` & `docker-compose.yml`).
- Automated daily PostgreSQL backup script with offsite backup sync.
- System health & performance monitoring (PM2 / Systemd + Prometheus metrics).

### ⬜ Phase 8 — Multi-Plant & Multi-Tenant Expansion (SaaS v2)
- Organization & Plant multi-tenancy schema isolation.
- Custom billing & subscription tier management.
