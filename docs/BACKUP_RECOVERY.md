# SR-013 & NFR-008: Database Backup & Recovery Procedure

## Architectural Decision & Scope
- **Phase 6 Verification**: Documented manual backup & point-in-time recovery procedure established.
- **Phase 7 Scope**: Automated daily cron backup script with retention policy (7 daily, 4 weekly, 12 monthly) and offsite sync.

---

## 1. Database Backup Procedure

WorkForce One uses PostgreSQL as its core database. Backup operations use `pg_dump` with custom compressed format (`-F c`), preserving all table schemas, enums, indexes, constraints, and audit logs.

### A. Ad-Hoc / Pre-Deployment Backup Command

```bash
# Set environment variables
export PGHOST=${POSTGRES_HOST:-localhost}
export PGPORT=${POSTGRES_PORT:-5432}
export PGUSER=${POSTGRES_USER:-postgres}
export PGDATABASE=${POSTGRES_DB:-workforce_one}
export PGPASSWORD=${POSTGRES_PASSWORD}

# Create backup directory
mkdir -p ./backups

# Execute pg_dump
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="./backups/wf1_db_backup_${TIMESTAMP}.dump"

pg_dump \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  -F c \
  -b \
  -v \
  -f "$BACKUP_FILE"

echo "Backup created successfully: $BACKUP_FILE"
```

---

## 2. Database Disaster Recovery Procedure

### A. Full Restore Procedure

```bash
# 1. Terminate active database connections
psql -h "$PGHOST" -U "$PGUSER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PGDATABASE' AND pid <> pg_backend_pid();"

# 2. Drop and recreate clean database
psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $PGDATABASE;"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "CREATE DATABASE $PGDATABASE;"

# 3. Restore schema & data using pg_restore
pg_restore \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  -v \
  "$BACKUP_FILE"

# 4. Verify table integrity
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
```

---

## 3. Data Integrity & Verification Checklist
1. Verify 14 core tables exist.
2. Verify immutable tables (`attendance_ledger`, `audit_logs`) maintain hash chaining integrity.
3. Verify Drizzle migrations match current schema state (`npx drizzle-kit check`).
