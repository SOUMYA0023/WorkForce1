/**
 * Database Connection
 *
 * Establishes a connection to the self-hosted PostgreSQL instance (ADR §1).
 * Uses node-postgres (pg) driver with Drizzle ORM.
 *
 * The database runs on the same VPS as the application for:
 * - Lower latency on the time-critical token validation path (PR-001, C-004)
 * - Fits within the PRD budget of ₹1,800–2,600/month (Section 14)
 * - Matches IR-001 (one production server)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Connection pool size — tuned for ~15K employees but modest VPS
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
