# Enterprise Architecture Blueprint — WorkForce One

**System:** WorkForce One Enterprise Workforce Attendance Management Platform  
**Client Target:** Tamil Nadu Coke and Power Private Limited (~15,000 Employees)  
**Version:** v0.3.0 — Production Baseline  
**Date:** July 2026  

---

## 1. System Overview & Architecture Philosophy

WorkForce One is a high-throughput, security-critical enterprise workforce attendance management system designed for industrial manufacturing facilities.

### Core Philosophy
1. **Server Authority (Zero Client Trust)**: All business decisions, timestamps, token claims, shift rule evaluations, and authorization checks are computed exclusively on the server. Device clocks and client state are strictly untrusted.
2. **Atomic Token Claiming**: Anti-replay QR token consumption uses atomic PostgreSQL `UPDATE...RETURNING` queries to eliminate Time-of-Check to Time-of-Use (TOCTOU) race conditions under heavy gate load.
3. **Single Source of Truth Attendance Intelligence**: All status and worked time computations are isolated exclusively within `src/lib/intelligence/`. No API routes, UI components, or Export engines re-interpret attendance rules.
4. **Immutability & Auditability**: Historical attendance records (`attendance_ledger`) and system audit logs (`audit_logs`) are strictly append-only. No `UPDATE` or `DELETE` operations are permitted on audit or ledger history.
5. **Single-Node VPS Economy**: Built to handle ~15,000 employees × 2 events/day (~30,000 attendance events/day) within a budget of ₹1,800–2,600/month on a single self-hosted VPS (ADR §1).

---

## 2. High-Level System Architecture Diagram

```mermaid
graph TD
    Client[Browser / Mobile PWA / Gate Scanner] -->|HTTPS / REST API| NextJS[Next.js 14 App Router]
    
    subgraph Application Server (VPS)
        NextJS --> Middleware[Next.js Middleware Guard]
        Middleware --> AuthLayer[NextAuth v5 & Credentials Provider]
        Middleware --> APIRoutes[API v1 Route Handlers]
        
        APIRoutes --> RBAC[RBAC Guard Matrix]
        RBAC --> Services[Domain Services Layer]
        
        subgraph Domain Services Layer
            Services --> ShiftEngine[Shift Engine]
            Services --> IntelligenceEngine[Attendance Intelligence Engine]
            Services --> OvertimeEngine[Overtime Engine]
            Services --> PayrollEngine[Payroll Engine]
            Services --> ExportEngine[Export Engine]
            Services --> TokenEngine[QR Token Engine]
            Services --> AuditLogger[Extended Audit Logger]
        end
        
        Services --> ORM[Drizzle ORM Layer]
    end
    
    subgraph Database Server (Self-Hosted PostgreSQL)
        ORM --> Postgres[(PostgreSQL 16 DB)]
        
        subgraph Data Storage
            Postgres --> CoreTables[Users / Employees / Shifts / Shift Assignments]
            Postgres --> QRTables[Attendance Tokens / Events]
            Postgres --> LedgerTables[Attendance Ledger - Immutable]
            Postgres --> PayrollTables[Payroll Records - Time-Based]
            Postgres --> AuditTables[Audit Logs - Immutable]
        end
    end
```

---

## 3. End-to-End Attendance & Payroll Flow Diagram

```mermaid
flowchart TD
    A[Gate Scanner Scan] -->|POST /api/v1/attendance/scan| B[Attendance Service]
    B -->|Atomic Token Claim| C[Insert attendance_events]
    C -->|Append Ledger| D[attendance_ledger]
    
    E[Payroll Generation Trigger] -->|POST /api/v1/payroll| F[Shift Engine]
    F -->|resolveActiveShift| G[Attendance Intelligence Engine]
    G -->|Calculate Worked Seconds & Status| H[Overtime Engine]
    H -->|Calculate OT & Undertime Seconds| I[Payroll Engine]
    I -->|Persist Record & Trace| J[payroll_records Table]
    J -->|Format-Only Serialization| K[Export Engine CSV / XLSX]
```

---

## 4. 5-Domain Engine Architecture (Phase 3)

```mermaid
graph LR
    subgraph Decoupled Phase 3 Engines
        Shift[Shift Engine] -->|resolveActiveShift| Intel[Attendance Intelligence Engine]
        Intel -->|workedSeconds & status| OT[Overtime Engine]
        OT -->|overtimeSeconds| Payroll[Payroll Engine]
        Payroll -->|pre-computed records| Export[Format-Only Export Engine]
    end
```

---

## 5. Database Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    users ||--o| employees : "linked_to"
    users ||--o{ sessions : "has"
    users ||--o{ accounts : "has"
    employees ||--o{ shift_assignments : "assigned"
    shifts ||--o{ shift_assignments : "template"
    employees ||--o{ attendance_tokens : "generates"
    employees ||--o{ attendance_events : "marks"
    attendance_tokens ||--o| attendance_events : "claims"
    shifts ||--o{ attendance_events : "shift"
    attendance_events ||--o| attendance_ledger : "ledger_entry"
    employees ||--o{ payroll_records : "payroll"
    attendance_events ||--o{ corrections : "corrected"
    users ||--o{ audit_logs : "performed_by"
    users ||--o{ import_batches : "uploaded_by"
```

---

## 6. Sequence Diagrams

### Sequence 1: Attendance Intelligence & Payroll Calculation

```mermaid
sequenceDiagram
    autonumber
    actor Admin as HR / Admin
    participant UI as /payroll Dashboard
    participant API as /api/v1/payroll
    participant Shift as Shift Engine
    participant Intel as Attendance Intelligence Engine
    participant OT as Overtime Engine
    participant Payroll as Payroll Engine
    participant DB as PostgreSQL

    Admin->>UI: Trigger Daily Payroll Calculation
    UI->>API: POST /api/v1/payroll { employeeId, periodDate }
    API->>Payroll: processDailyPayrollRecord(...)
    Payroll->>Intel: calculateAttendanceIntelligence({ employeeId, eventDate })
    Intel->>Shift: resolveActiveShift(employeeId, eventDate)
    Shift->>DB: Query shift_assignments (ADR §9)
    DB-->>Shift: Return Active Assignment & Shift Template
    Intel->>DB: Query raw attendance_events for date
    Intel->>Intel: Compute Worked Seconds, Break Deductions & Status
    Intel-->>Payroll: Return AttendanceIntelligenceOutput
    Payroll->>OT: calculateOvertime(intelligenceOutput)
    OT-->>Payroll: Return OvertimeEngineOutput
    Payroll->>DB: Upsert payroll_records (Base unit: Seconds per ADR §6)
    Payroll-->>API: Return Payroll Record & Explainable Trace
    API-->>UI: Display Payroll Card & Explain Trace Button
```

---

## 7. Security Architecture Summary

- **Authentication**: NextAuth Credentials Provider using bcryptjs password hashing (12 salt rounds).
- **Session Strategy**: Database & JWT session management (`SESSION_TIMEOUT_MINUTES=30`).
- **Anti-Replay Defense**: Single-use atomic token claim (`UPDATE...RETURNING`).
- **Single Active Token**: Refreshing QR invalidates previous unconsumed active tokens.
- **Audit Policy**: Immutable append-only audit trail logging all `AUTH`, `EMPLOYEE`, `SHIFT`, `PAYROLL`, `ATTENDANCE`, and `SYSTEM` events.

---

## 8. Scalability & Deployment Architecture

- **Current Scalability**: Scaled for ~15,000 employees × 2 events/day on a single 4-core, 8GB RAM VPS.
- **Database Indexes**: Composite indices on `(employee_id, event_date)`, `(employee_id, is_consumed, expires_at)`, and unique composite index on `(employee_id, event_type, event_date)`.
