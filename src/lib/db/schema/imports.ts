/**
 * Import Batches Schema (Refinement #10)
 *
 * Stores metadata and row-level validation reporting for every bulk employee
 * import operation for audit, troubleshooting, and review purposes.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    filename: varchar("filename", { length: 255 }).notNull(),
    totalRecords: integer("total_records").notNull(),
    successfulRecords: integer("successful_records").notNull(),
    failedRecords: integer("failed_records").notNull(),
    skippedRecords: integer("skipped_records").notNull().default(0),
    isDryRun: jsonb("is_dry_run").default(false), // Tracks if run was dry run or committed
    validationReport: jsonb("validation_report"), // Row-level errors and warnings
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("import_batches_uploaded_by_idx").on(table.uploadedBy),
    index("import_batches_created_at_idx").on(table.createdAt),
  ]
);
