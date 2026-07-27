# Enterprise Architecture Blueprint — WorkForce One

**System:** WorkForce One Enterprise Workforce Attendance Management Platform  
**Client Target:** Tamil Nadu Coke and Power Private Limited (~15,000 Employees)  
**Version:** v0.2.0 — Production Baseline Baseline  
**Date:** July 2026  

---

## 1. System Overview & Architecture Philosophy

WorkForce One is a high-throughput, security-critical enterprise workforce attendance management system designed for industrial manufacturing facilities.

### Core Philosophy
1. **Server Authority (Zero Client Trust)**: All business decisions, timestamps, token claims, shift rule evaluations, and authorization checks are computed exclusively on the server. Device clocks and client state are strictly untrusted.
2. **Atomic Token Claiming**: Anti-replay QR token consumption uses atomic PostgreSQL `UPDATE...RETURNING` queries to eliminate Time-of-Check to Time-of-Use (TOCTOU) race conditions under heavy gate load.
3. **Immutability & Auditability**: Historical attendance records (`attendance_ledger`) and system audit logs (`audit_logs`) are strictly append-only. No `UPDATE` or `DELETE` operations are permitted on audit or ledger history.
4. **Single-Node VPS Economy**: Built to handle ~15,000 employees × 2 events/day (~30,000 attendance events/day) within a budget of ₹1,800–2,600/month on a single self-hosted VPS (ADR §1).

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
        
        subgraph Domain Services
            Services --> TokenEngine[QR Token Engine]
            Services --> CheckInOut[Attendance Service]
            Services --> ImportEngine[Bulk Import Engine]
            Services --> AuditLogger[Extended Audit Logger]
        end
        
        Services --> ORM[Drizzle ORM Layer]
    end
    
    subgraph Database Server (Self-Hosted PostgreSQL)
        ORM --> Postgres[(PostgreSQL 16 DB)]
        
        subgraph Data Storage
            Postgres --> CoreTables[Users / Employees / Shifts]
            Postgres --> QRTables[Attendance Tokens / Events]
            Postgres --> LedgerTables[Attendance Ledger - Immutable]
            Postgres --> AuditTables[Audit Logs - Immutable]
        end
    end
```

---

## 3. End-to-End Attendance Request Flow Diagram

```mermaid
flowchart TD
    A[Employee Login] -->|Credentials| B[NextAuth Auth]
    B -->|Session Cookie Set| C[Employee Opens /my-qr]
    C -->|POST /api/v1/attendance/qr| D[Token Engine]
    D -->|Invalidate old tokens| E[Store Hashed Token SHA-256]
    E -->|Return rawToken & 15s timer| F[Employee Displays QR]
    
    F -->|Gate Operator Scans QR| G[POST /api/v1/attendance/scan]
    G -->|RBAC Check: ATTENDANCE_SCAN| H[Scanner 5s Suppression Check]
    H -->|Atomic Claim: UPDATE...RETURNING| I{Claim Result?}
    
    I -- 0 Rows Affected --> J[Reject: ATT_004 Expired / ATT_005 Reused / ATT_006 Invalid]
    I -- 1 Row Affected --> K[Begin DB Transaction]
    
    K --> L[Validate Employee Active Status]
    L --> M[Fetch Active Shift Assignment]
    M --> N[Check Duplicate Check-In / Check-Out]
    N --> O[Insert attendance_events]
    O --> P[Calculate Worked Time & Grace Margins]
    P --> Q[Append attendance_ledger Record]
    Q --> R[Write Audit Log Entry]
    R --> S[Commit DB Transaction]
    S --> T[Return Success HTTP 200]
```

---

## 4. Module Architecture Diagram

```mermaid
graph LR
    subgraph Application Modules
        A[src/lib/auth] -->|User Auth & Lockout| B[src/lib/db]
        C[src/lib/audit] -->|Append-Only Logs| B
        D[src/lib/employees] -->|CRUD & Bulk Import| B
        E[src/lib/attendance] -->|QR & Check-In/Out| B
        F[src/lib/api] -->|Response Format & Rate Limit| G[src/app/api/v1]
    end
    
    G --> A
    G --> D
    G --> E
    G --> C
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

    users {
        uuid id PK
        varchar email
        varchar password_hash
        enum role
        uuid employee_id FK
        boolean is_active
        integer failed_login_attempts
        timestamp locked_until
    }

    employees {
        uuid id PK
        varchar employee_code UK
        varchar first_name
        varchar last_name
        varchar department
        varchar designation
        varchar email UK
        varchar phone_number UK
        enum status
        date joined_at
        timestamp deleted_at
        uuid deleted_by FK
    }

    shifts {
        uuid id PK
        varchar name
        time start_time
        time end_time
        integer break_duration_seconds
        integer late_grace_seconds
        integer early_exit_grace_seconds
    }

    shift_assignments {
        uuid id PK
        uuid employee_id FK
        uuid shift_id FK
        date effective_from
        date effective_to
        uuid assigned_by FK
    }

    attendance_tokens {
        uuid id PK
        uuid employee_id FK
        varchar token_hash UK
        enum token_type
        timestamp generated_at
        timestamp expires_at
        timestamp consumed_at
        boolean is_consumed
    }

    attendance_events {
        uuid id PK
        uuid employee_id FK
        enum event_type
        date event_date
        timestamp event_timestamp
        uuid token_id FK
        uuid shift_id FK
        uuid validated_by FK
    }

    attendance_ledger {
        uuid id PK
        uuid attendance_event_id FK
        uuid employee_id FK
        enum event_type
        date event_date
        timestamp event_timestamp
        uuid shift_id FK
        integer worked_seconds
        boolean is_late
        integer late_seconds
        boolean is_early_exit
        integer early_exit_seconds
        varchar record_hash
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        varchar action
        enum category
        varchar resource_type
        uuid resource_id
        jsonb details
        varchar ip_address
        text user_agent
    }
```

---

## 6. Sequence Diagrams

### Sequence 1: Employee Login & Session Creation

```mermaid
sequenceDiagram
    autonumber
    actor Employee
    participant UI as Login Page (/login)
    participant API as /api/v1/auth/login
    participant Lockout as Lockout Engine
    participant DB as PostgreSQL
    participant Audit as Audit Logger

    Employee->>UI: Enter Email & Password
    UI->>API: POST Credentials
    API->>DB: Query User by Email
    DB-->>API: Return User Record
    API->>Lockout: Check Lockout (failed_login_attempts, locked_until)
    alt Is Account Locked?
        Lockout-->>API: Locked (remainingMinutes)
        API->>Audit: Log LOGIN_BLOCKED_LOCKED
        API-->>UI: Return HTTP 423 Locked
    else Account Active
        API->>DB: Verify Employee Status === 'active'
        API->>API: bcrypt.compare(password, hash)
        alt Password Invalid
            API->>Lockout: Increment failed_login_attempts
            API->>Audit: Log LOGIN_FAILED
            API-->>UI: Return HTTP 401 Unauthorized
        else Password Valid
            API->>Lockout: Reset failed_login_attempts = 0
            API->>Audit: Log LOGIN_SUCCESS
            API-->>UI: Return Session Token Cookie
        end
    end
```

### Sequence 2: QR Token Generation & Auto-Refresh

```mermaid
sequenceDiagram
    autonumber
    actor Employee
    participant UI as /my-qr Page
    participant API as /api/v1/attendance/qr
    participant Engine as Token Engine
    participant DB as PostgreSQL

    Employee->>UI: View My QR Page
    loop Every 15 Seconds
        UI->>API: POST /api/v1/attendance/qr { tokenType }
        API->>API: Verify auth() session & rate limit
        API->>Engine: generateAttendanceToken(employeeId, tokenType)
        Engine->>DB: Invalidate previous unconsumed active tokens
        Engine->>Engine: crypto.randomBytes(32) + SHA-256 tokenHash
        Engine->>DB: INSERT into attendance_tokens (expires_at = +30s)
        Engine-->>API: Return rawToken & expiresAt
        API-->>UI: Return rawToken & 15s refresh interval
        UI->>UI: Render SVG QR Code & Start 15s Countdown Bar
    end
```

### Sequence 3: Gate Scanner Check-In & Check-Out Execution

```mermaid
sequenceDiagram
    autonumber
    actor Scanner as Gate Operator
    participant UI as /scanner Page
    participant API as /api/v1/attendance/scan
    participant Service as Attendance Service
    participant DB as PostgreSQL
    participant Audit as Audit Logger

    Scanner->>UI: Scan Employee QR Code
    UI->>API: POST /api/v1/attendance/scan { token }
    API->>API: Verify auth() session & ATTENDANCE_SCAN role
    API->>Service: processAttendanceScan({ rawToken })
    Service->>Service: Check 5s Scanner Duplicate Suppression
    
    rect rgb(20, 30, 50)
        note right of Service: Begin Database Transaction
        Service->>DB: UPDATE attendance_tokens SET is_consumed=true WHERE is_consumed=false RETURNING *
        alt 0 Rows Returned
            DB-->>Service: Claim Failed
            Service-->>API: Reject (ATT_004 Expired / ATT_005 Reused / ATT_006 Invalid)
        else 1 Row Claimed
            Service->>DB: Validate Employee Status === 'active'
            Service->>DB: Fetch Active Shift Assignment
            Service->>DB: Check Duplicate Check-In / Check-Out
            Service->>DB: INSERT attendance_events
            Service->>DB: Calculate Worked Seconds & Shift Grace Margins
            Service->>DB: INSERT attendance_ledger (Immutable Append)
            Service->>Audit: INSERT audit_logs
            Service->>DB: Commit Transaction
        end
    end
    
    Service-->>API: Return Attendance Result
    API-->>UI: Return HTTP 200 Success / HTTP 400 Error
    UI->>Scanner: Display Visual/Audio Flash Feedback
```

---

## 7. Security Architecture Summary

- **Authentication**: NextAuth Credentials Provider using bcryptjs password hashing (12 salt rounds).
- **Session Strategy**: Database & JWT session management (`SESSION_TIMEOUT_MINUTES=30`).
- **Account Lockout**: 5 consecutive failed login attempts trigger a 15-minute lockout.
- **Anti-Replay Defense**: Single-use atomic token claim (`UPDATE...RETURNING`).
- **Single Active Token**: Refreshing QR invalidates previous unconsumed active tokens.
- **Rate Limiting**: Sliding window rate limiting on `/api/v1/auth/login` (10 req/min) and `/api/v1/attendance/scan` (60 req/min).
- **Audit Policy**: Immutable append-only audit trail logging all `AUTH`, `EMPLOYEE`, `SHIFT`, `PAYROLL`, `ATTENDANCE`, and `SYSTEM` events.

*For complete threat models and security policies, see [`SECURITY.md`](./SECURITY.md).*

---

## 8. Scalability & Deployment Architecture

```mermaid
graph TD
    subgraph Deployment Infrastructure (Single VPS / Future Cloud)
        Nginx[Nginx Reverse Proxy / TLS Termination] --> NextApp[Next.js App Server Node.js]
        NextApp --> PgPool[node-postgres Connection Pool max 20]
        PgPool --> Postgres[(PostgreSQL 16 Instance)]
    end
```

- **Current Scalability**: Scaled for ~15,000 employees × 2 events/day on a single 4-core, 8GB RAM VPS.
- **Database Indexes**: Composite indices on `(employee_id, event_date)`, `(employee_id, is_consumed, expires_at)`, and unique composite index on `(employee_id, event_type, event_date)`.
- **Future Scale**: Read replicas for analytical queries (Phase 5) and Redis token store if multi-node cluster is deployed.

---

## 9. Coding & API Standards

- **API Route Structure**: `/api/v1/...`
- **Response Format**: `{ success: true, data: T, meta?: Record<string, any> }`
- **Error Format**: `{ success: false, error: { code: string, message: string, details?: any } }`
- **Error Codes**: `AUTH_001`–`005`, `EMP_001`–`005`, `ATT_001`–`010`, `SYS_001`–`003`.
- **Relational Keys**: 100% internal UUID primary & foreign keys. `employeeCode` is strictly a business display string.
