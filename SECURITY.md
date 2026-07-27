# Security Architecture & Policies — WorkForce One

**System:** WorkForce One Enterprise Workforce Attendance Management  
**Client:** Tamil Nadu Coke and Power Private Limited  
**Version:** 1.0 (July 2026)  
**Classification:** Confidential & Proprietary  

---

## 1. Threat Model & Security Posture

WorkForce One is designed for industrial environments where attendance directly affects payroll calculations and plant safety. The core principle is **Zero Client Trust (Server Authority)**.

### Threat Matrix & Defensive Countermeasures

| Threat / Attack Vector | Attack Description | System Countermeasure |
|------------------------|-------------------|----------------------|
| **QR Screenshot Reuse** | Employee screenshots QR code and sends to colleague. | **Short-lived tokens (30s expiry)** + **15s auto-refresh** + **Single-Use Atomic Claims**. Expired/consumed screenshots are rejected instantly. |
| **Replay Attacks** | Intercepted network payload re-submitted to scanner endpoint. | **Cryptographic SHA-256 Token Hashes** + **Atomic `UPDATE...RETURNING`**. Second claim attempt returns 0 rows and is rejected with `ATT_005`. |
| **Race Condition Scans** | Rapid/simultaneous scan requests for same QR payload. | **Row-level locking in PostgreSQL transaction**. Exactly one `UPDATE` succeeds; concurrent claims fail. |
| **Forged Payload** | Malicious actor guesses or fabricates QR string. | **256-bit entropy** generated via `crypto.randomBytes(32)`. Unrecognized tokens fail DB lookup with `ATT_006`. |
| **Duplicate Attendance** | Employee checks in multiple times on the same shift. | **Database Unique Composite Index** `(employee_id, event_type, event_date)` guarantees duplicate prevention at DB engine level (`ATT_001` / `ATT_003`). |
| **Proxy Attendance** | Unauthorized user scanning for another employee. | **Session Authentication** required for QR display + **Gate Operator Validation** + **Hardware Security Gate Controls** (AS-001). |
| **Brute Force Scans** | Malicious actor spamming validation endpoint. | **In-memory Sliding Window Rate Limiting** (`src/lib/api/rate-limit.ts`) caps scanner API requests (60 req/min). |

---

## 2. Token Lifecycle & Single-Use Semantics

Every QR token adheres to a strict lifecycle:

```
[Employee Session] ──► Generate (crypto.randomBytes)
                              │
                              ▼
                 Invalidate previous active tokens
                              │
                              ▼
            Store SHA-256 hash in attendance_tokens
                   (expires_at = now() + 30s)
                              │
                              ▼
                   Employee presents QR
                              │
                              ▼
          Atomic Claim: UPDATE ... WHERE is_consumed = false
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
        [1 Row Affected]              [0 Rows Affected]
        Token Consumed!             REJECT: Expired (ATT_004)
        Record Attendance            / Reused (ATT_005)
        Append Ledger                / Invalid (ATT_006)
        Write Audit Log
```

### Atomic Token Claim Query

```sql
UPDATE attendance_tokens
SET is_consumed = true, consumed_at = now()
WHERE token_hash = $1 AND is_consumed = false AND expires_at > now()
RETURNING *;
```

---

## 3. Server Authority & Timezone Standardization

1. **Timestamps**: Stored strictly in UTC (`timestamp with time zone`).
2. **Plant Date & Shift Boundaries**: Evaluated using the configured plant timezone (`PLANT_TIMEZONE`, default `Asia/Kolkata`). Device clocks, scanner clocks, and browser clocks are completely ignored.
3. **Immutability**: `attendance_ledger` and `audit_logs` are append-only. No `UPDATE` or `DELETE` operations are permitted on ledger or audit history.

---

## 4. Role-Based Access Control (RBAC)

Enforced via `src/lib/auth/rbac.ts` and API authorization guards:

- `super_admin`: Full system configuration, role assignment, all reports, full audit logs.
- `admin`: Attendance oversight, employee management, shift assignments, exception reviews, reports.
- `gate_operator`: Scanner point operations (`POST /api/v1/attendance/scan`) & live monitoring dashboard only.
- `hr_payroll`: Employee master data, payroll export, attendance reports.
- `employee`: Personal QR token (`GET /my-qr`), personal attendance history.

---

## 5. Audit Trail & Incident Logging

Every security-sensitive event writes an append-only log to `audit_logs`:

- `AUTH`: Login success, login failure, account lockout, logout.
- `ATTENDANCE`: Token generation, token validation success, token validation failure, duplicate attempt, check-in, check-out.
- `EMPLOYEE`: Employee created, updated, soft deleted, bulk imported.
- `SYSTEM`: Policy configuration updates.

Logs capture: `user_id`, `action`, `category`, `resource_type`, `resource_id`, `details` (JSON), `ip_address`, `user_agent`, `browser`, `os`, and `created_at`.
