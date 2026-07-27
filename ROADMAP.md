# Product Roadmap — WorkForce One

**WorkForce One** Enterprise Workforce Attendance Management & Payroll Engine  
Target Platform: Version 1 Commercial SaaS Baseline (`v0.2.0`)  

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
- Bulk Spreadsheet Import Engine (CSV & XLSX with Dry-Run mode, partial import, and `import_batches` logging).
- Account lockout after 5 failed attempts + 12+ char password complexity enforcer.
- Standardized `/api/v1/...` routes with structured error codes (`AUTH_...`, `EMP_...`).

### ✅ Phase 2 — QR Token Engine & Check-In/Check-Out Core (`v0.2.0`)
- Server-authority QR token engine (256-bit entropy payload, SHA-256 token hashing).
- Single active token per action: QR refresh invalidates previous unconsumed active tokens.
- Atomic token claiming (`UPDATE...RETURNING`) eliminating TOCTOU race conditions.
- Transaction-safe attendance processing with duplicate check-in/out prevention (`ATT_001`–`ATT_003`).
- Plant timezone standardization (`PLANT_TIMEZONE=Asia/Kolkata`).
- Shift boundary grace period & worked seconds calculation.
- 5-second scanner duplicate suppression window.
- Operational metrics recorder (`src/lib/attendance/metrics.ts`).
- Dedicated security architecture documentation ([`SECURITY.md`](./SECURITY.md)).
- Dynamic Employee QR View (`/my-qr`) & Gate Operator Scanner View (`/scanner`).

---

## Future Phase Roadmap

```
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Phase 3   │ ──► │   Phase 4   │ ──► │   Phase 5   │ ──► │   Phase 6   │
  │ Shift & OT  │     │ Live Monitoring│    │ Reporting & │     │ Mobile PWA  │
  │   Engine    │     │ & Exceptions│     │   Payroll   │     │ & Scanner   │
  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

### ⬜ Phase 3 — Shift Management & Payroll/Overtime Engine

**Objectives:** Build flexible shift schedule management and deterministic time-based payroll/overtime computation.

**Deliverables:**
- Shift template CRUD (morning, afternoon, night, flexible shifts).
- Employee shift assignment & rotation history management.
- Overtime calculation engine (time-based only in seconds per ADR §6, no currency).
- Late arrival & undertime deduction seconds computation.
- Automated daily payroll record generation (`payroll_records` table).
- Correction-to-payroll auto-recalculation trigger (ADR §8).

**Dependencies:** Phases 0–2.  
**Exit Criteria:** Worked seconds, overtime seconds, and undertime seconds calculated deterministically for 100% of attendance events.

---

### ⬜ Phase 4 — Live Attendance Dashboard & Exception Workflow

**Objectives:** Provide real-time gate monitoring for administrators and exception handling workflows.

**Deliverables:**
- Live attendance monitoring dashboard with near real-time polling (ADR §10).
- Gate operator live feed displaying check-ins/outs in real time.
- Attendance exception queue (missing check-out, unassigned shift, late arrival).
- Authorized attendance correction workflow (`corrections` table) with mandatory reason capture and admin approval.

**Dependencies:** Phase 3.  
**Exit Criteria:** Attendance exceptions flagged automatically; corrections trigger automatic payroll recalculation.

---

### ⬜ Phase 5 — Reporting, Analytics & Export System

**Objectives:** High-performance reporting and export capability for HR and management.

**Deliverables:**
- Daily, weekly, and monthly attendance summary reports.
- Overtime and undertime summary reports by department and designation.
- High-speed CSV and XLSX export system for downstream payroll software integration (time-based values in seconds).
- Audit trail reporting for compliance audits (FR-047).

**Dependencies:** Phases 3 & 4.  
**Exit Criteria:** Reports generated in < 2 seconds for 15,000 employees.

---

### ⬜ Phase 6 — Mobile QR App & Gate Scanner PWA

**Objectives:** Dedicated Progressive Web App (PWA) experience for gate scanners and employee mobile access.

**Deliverables:**
- Camera-based QR code scanner stream (`html5-qrcode`) for gate operators.
- Offline-resilient PWA manifest & service worker for employee QR display.
- Mobile-optimized responsive UI for iOS and Android web views.

**Dependencies:** Phase 2.  
**Exit Criteria:** Gate operator camera scans QR in < 300ms.

---

### ⬜ Phase 7 — Production Deployment, Backups & Monitoring

**Objectives:** Production deployment on self-hosted VPS with automated backups and system health monitoring.

**Deliverables:**
- Docker containerization (`Dockerfile` & `docker-compose.yml`).
- Automated daily PostgreSQL backup script with offsite backup sync.
- System health & performance monitoring (PM2 / Systemd + Prometheus metrics).
- Nginx reverse proxy setup with SSL/TLS termination.

**Dependencies:** Phases 1–5.  
**Exit Criteria:** System deployed on production VPS meeting PRD budget (₹1,800–2,600/month).

---

### ⬜ Phase 8 — Multi-Plant & Multi-Tenant Expansion (SaaS v2)

**Objectives:** Expand WorkForce One into a multi-tenant commercial SaaS platform supporting multiple industrial plants and organizations.

**Deliverables:**
- Organization & Plant multi-tenancy schema isolation.
- Organization-level custom attendance policy management.
- Custom billing & subscription tier management.

**Dependencies:** Phases 1–7.  
**Exit Criteria:** Multi-plant tenant isolation verified with zero data leakage between organizations.
