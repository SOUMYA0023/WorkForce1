# Architecture Decision Record — WorkForce One

**Date:** July 2026  
**Status:** Accepted  
**Author:** Soumya Suman Kar

---

## ADR §1 — Self-Hosted PostgreSQL on VPS

**Decision:** Self-hosted PostgreSQL on the same VPS as the application.

**Context:** The PRD targets a single low-cost VPS with monthly operating costs of ₹1,800–2,600 (Section 14). At ~15,000 employees × 2 events/day = ~30,000 attendance rows/day plus audit logs, managed database services like Supabase Cloud would exceed free-tier limits within months. Supabase Pro (~₹2,100/mo) alone would consume nearly the entire budget for VPS + backup + monitoring combined.

**Rationale:**
- Lower latency for the time-critical atomic token validation path (PR-001, C-004) — no network hop to an external DB.
- Fits within the PRD's infrastructure model: one production server (IR-001).
- Full control over PostgreSQL configuration, backups, and tuning.
- ACID compliance ensures attendance records are never lost (NFR-003).

**Consequences:**
- More ops responsibility (backups, monitoring, upgrades) — addressed in Phase 7.
- Live dashboard updates (Phase 4) will use short-interval polling or a lightweight WebSocket instead of Supabase Realtime.

---

## ADR §2 — Drizzle ORM

**Decision:** Use Drizzle ORM for database access.

**Context:** Need a TypeScript-first ORM that is lightweight enough for a low-resource VPS while providing type safety and migration support.

**Rationale:**
- Type-safe schema definitions with excellent TypeScript inference.
- Lightweight compared to Prisma (no heavy client generation step).
- Supports raw SQL for the atomic `UPDATE...RETURNING` token claiming pattern.
- Built-in migration tooling via `drizzle-kit`.

**Consequences:**
- Less auto-generated API surface than Prisma — more explicit code for relations.
- Team must learn Drizzle-specific patterns.

---

## ADR §3 — NextAuth with Database Sessions

**Decision:** Use NextAuth (Auth.js v5) with **database session strategy**, not JWT.

**Context:** The system requires secure credential-based authentication (FR-001) with session expiration (FR-004) and the ability to immediately revoke access for deactivated or compromised accounts (SR-004).

**Rationale:**
- JWT sessions cannot be revoked server-side — a deactivated account would remain authenticated until the JWT naturally expires. This is unacceptable for an attendance system whose core purpose is access control and fraud prevention.
- Database sessions allow immediate revocation: delete the session row and the user is logged out on their next request.
- The extra DB lookup per request is negligible at this scale (~15K employees, not millions of concurrent web users).
- Session timeout is configurable via `SESSION_TIMEOUT_MINUTES` (default: 30 minutes).

**Consequences:**
- One additional DB query per authenticated request (session lookup).
- NextAuth requires `sessions`, `accounts`, and `verification_tokens` tables in the database.

---

## ADR §4 — Single App, Not Monorepo

**Decision:** Single Next.js 14 (App Router) application with internal module separation.

**Context:** The PRD scopes this as a single-site system (OOS-010 excludes multi-plant). Deployment target is one VPS (Section 13).

**Rationale:**
- Simpler deployment on a single low-cost VPS.
- No inter-package coordination overhead.
- Domain separation achieved via `src/lib/{attendance,payroll,reporting,audit}` modules per NFR-008 (attendance logic, reporting, and administration separable for maintainability).

**Consequences:**
- If multi-plant support (FS-005) is added later, may need to evaluate whether the single-app approach still scales.

---

## ADR §5 — 15K Employee Scalability

**Decision:** Scalability achieved through proper indexing, paginated queries, and efficient schema design rather than horizontal scaling.

**Context:** The system must support ~15,000 employees without redesign (NFR-011) and handle concurrent access during peak attendance windows (NFR-012).

**Rationale:**
- PostgreSQL comfortably handles this scale on a single node with proper indexing.
- Composite indices on high-frequency query paths: `(employee_id, event_date)`, `(employee_id, event_type, event_date)`, `(employee_id, is_consumed, expires_at)`.
- Paginated queries for all list/report views.
- Connection pooling (pg Pool, max 20 connections) sized for the VPS.

**Consequences:**
- Performance must be validated via load testing before production deployment.
- If the workforce significantly exceeds 15K, may need read replicas or query optimization.

---

## ADR §6 — Seconds as Base Unit, No Currency

**Decision:** All time calculations use integer seconds as the base unit. The payroll table stores only time-based values — no currency columns.

**Context:** The PRD specifies second-level precision (FR-029) and time-based payroll outputs (Section 8.3). It does not scope WorkForce One to compute wage amounts in currency.

**Rationale:**
- Integer seconds avoid floating-point rounding issues entirely.
- Downstream rounding is the consumer's responsibility (PW-004) — the stored value is always exact.
- Removing `hourly_rate`, `overtime_amount`, and `deduction_amount` avoids scope creep into rate management, rate history, and currency precision that hasn't been requested.
- HR/Payroll's downstream system is responsible for applying rates.

**Consequences:**
- WorkForce One cannot generate currency-denominated payroll reports. This is intentional — it's a time tracking system, not a payroll system.
- If currency calculations are later requested, they would be added as a separate module.

---

## ADR §7 — Atomic Token Claiming (CRITICAL)

**Decision:** Token consumption must use a single atomic `UPDATE...RETURNING` statement, never a check-then-act `SELECT` followed by `UPDATE`.

**Context:** The QR token validation endpoint runs under real-time gate pressure (PR-001) with potential concurrent scan attempts (e.g., employee presents QR, gate operator scans twice quickly, or a replayed token arrives near-simultaneously).

**Rationale:**
- A `SELECT` to check token status followed by an `UPDATE` to consume it creates a TOCTOU (Time-of-Check, Time-of-Use) race condition. Under concurrent load, two requests could both see `is_consumed = false` and both proceed to consume the token.
- The atomic `UPDATE...RETURNING` pattern eliminates this entirely:

```sql
UPDATE attendance_tokens
SET is_consumed = true, consumed_at = now()
WHERE id = $1 AND is_consumed = false AND expires_at > now()
RETURNING *;
```

- Zero rows returned = reject the scan (expired, already used, or invalid).
- PostgreSQL's row-level locking ensures only one concurrent `UPDATE` succeeds.
- The index on `(employee_id, is_consumed, expires_at)` directly supports this query.

**Consequences:**
- Phase 2's `token-engine.ts` must implement exactly this pattern.
- Error messages to the gate operator should distinguish between "token expired" and "token already used" — but this requires two separate queries only in the *error path* (after the atomic UPDATE returns zero rows), not in the happy path.

---

## ADR §8 — Corrections-to-Payroll Interaction

**Decision:** Option (a) — Approving a correction automatically triggers payroll recalculation and un-finalizes the record.

**Context:** When a correction is approved for an attendance event whose payroll record is already `is_finalized = true`, the system needs a defined behavior. This maps to RA-005 (payroll disputes due to incorrect rules) in the PRD's risk register.

**Rationale:**
- The PRD prioritizes accuracy (FR-034, PW-005 — values must be reproducible from stored timestamps) and traceability (FR-023, SR-005 — all changes logged).
- Blocking corrections on finalized periods (Option b) would force HR to work around the system via manual adjustments, defeating the audit trail.
- The self-correcting approach ensures payroll always reflects the true attendance record.

**Implementation:**
1. The correction approval handler sets `payroll_records.is_finalized = false` for the affected `(employee_id, period_date)`.
2. The payroll calculator re-runs for that record using the corrected timestamps.
3. Both the un-finalization and recalculation are logged in the audit trail.
4. The `corrections.payroll_impact` column records `recalculation_triggered`.

**Consequences:**
- HR/Payroll must be aware that finalized records can revert — this should be documented in the user manual.
- The recalculation must produce deterministic results from the same timestamps (PW-005).

---

## ADR §9 — Shift Source of Truth

**Decision:** An employee's current shift is derived exclusively from `shift_assignments`, not a denormalized column on `employees`.

**Context:** Having both `employees.current_shift_id` and `shift_assignments` creates two sources of truth for the same fact. They can drift out of sync if one is updated without the other.

**Rationale:**
- Eliminates dual-write drift risk entirely.
- `shift_assignments` preserves full history (when shifts were assigned/changed, by whom).
- Query pattern: `WHERE employee_id = $1 AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1`.
- A `getCurrentShift(employeeId)` helper function encapsulates this.
- The `(employee_id, effective_to)` index supports efficient lookup.

**Consequences:**
- Every shift lookup requires a join or subquery to `shift_assignments` instead of reading a column on `employees`.
- If this becomes a measurable performance bottleneck (unlikely at 15K scale), a cached/materialized column can be added later with clear documentation that `shift_assignments` remains the authoritative source and the column must be updated in the same transaction.

---

## ADR §10 — Live Dashboard Strategy

**Decision:** Live dashboard updates (Phase 4) will use short-interval polling by default, with WebSocket as an option if latency requirements demand it.

**Context:** Without Supabase Realtime (removed in ADR §1), the live attendance monitoring dashboard (FR-035, FR-036) needs an alternative real-time update mechanism.

**Rationale:**
- Short-interval polling (~5 seconds) is the simplest approach and sufficient for an attendance dashboard where "near real-time" (PR-002: "minimal delay") is acceptable.
- A lightweight WebSocket server can be added later if sub-second updates are needed.
- Decision deferred to Phase 4 implementation — polling is the default.

**Consequences:**
- Polling at 5-second intervals with ~10 concurrent admin/operator sessions = ~120 queries/minute — well within PostgreSQL's capacity at this scale.
- If WebSocket is chosen later, a small standalone server or Next.js API route with Server-Sent Events (SSE) would be used.
