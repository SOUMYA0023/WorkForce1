ALTER TYPE "public"."employee_status" ADD VALUE 'suspended';--> statement-breakpoint
ALTER TYPE "public"."employee_status" ADD VALUE 'terminated';--> statement-breakpoint
ALTER TYPE "public"."employee_status" ADD VALUE 'on_leave';--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" varchar(255) NOT NULL,
	"total_records" integer NOT NULL,
	"successful_records" integer NOT NULL,
	"failed_records" integer NOT NULL,
	"skipped_records" integer DEFAULT 0 NOT NULL,
	"is_dry_run" jsonb DEFAULT 'false'::jsonb,
	"validation_report" jsonb,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."audit_category";--> statement-breakpoint
CREATE TYPE "public"."audit_category" AS ENUM('AUTH', 'EMPLOYEE', 'SHIFT', 'PAYROLL', 'ATTENDANCE', 'SYSTEM');--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "category" SET DATA TYPE "public"."audit_category" USING "category"::"public"."audit_category";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "designation_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "phone_number" varchar(50);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_uploaded_by_idx" ON "import_batches" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "import_batches_created_at_idx" ON "import_batches" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_email_idx" ON "employees" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_phone_number_idx" ON "employees" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "employees_designation_idx" ON "employees" USING btree ("designation");--> statement-breakpoint
CREATE INDEX "employees_deleted_at_idx" ON "employees" USING btree ("deleted_at");