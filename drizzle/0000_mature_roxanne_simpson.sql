CREATE TYPE "public"."attendance_event_type" AS ENUM('check_in', 'check_out');--> statement-breakpoint
CREATE TYPE "public"."token_type" AS ENUM('check_in', 'check_out');--> statement-breakpoint
CREATE TYPE "public"."audit_category" AS ENUM('auth', 'attendance', 'correction', 'config', 'export');--> statement-breakpoint
CREATE TYPE "public"."correction_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."correction_type" AS ENUM('manual_check_in', 'manual_check_out', 'time_adjustment', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."payroll_impact" AS ENUM('none', 'recalculation_triggered', 'blocked_finalized');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'gate_operator', 'hr_payroll', 'employee');--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"event_type" "attendance_event_type" NOT NULL,
	"event_date" date NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"token_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"validated_by" uuid,
	"is_corrected" boolean DEFAULT false NOT NULL,
	"correction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_event_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"event_type" "attendance_event_type" NOT NULL,
	"event_date" date NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"shift_id" uuid NOT NULL,
	"worked_seconds" integer,
	"is_late" boolean DEFAULT false NOT NULL,
	"late_seconds" integer DEFAULT 0 NOT NULL,
	"is_early_exit" boolean DEFAULT false NOT NULL,
	"early_exit_seconds" integer DEFAULT 0 NOT NULL,
	"record_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"token_type" "token_type" NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"is_consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"category" "audit_category" NOT NULL,
	"resource_type" varchar(100),
	"resource_id" uuid,
	"details" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_event_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"corrected_by" uuid NOT NULL,
	"approved_by" uuid,
	"correction_type" "correction_type" NOT NULL,
	"original_timestamp" timestamp with time zone NOT NULL,
	"corrected_timestamp" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" "correction_status" DEFAULT 'pending' NOT NULL,
	"payroll_impact" "payroll_impact" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_code" varchar(50) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"department" varchar(100) NOT NULL,
	"designation" varchar(100) NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"joined_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period_date" date NOT NULL,
	"shift_id" uuid NOT NULL,
	"check_in_timestamp" timestamp with time zone NOT NULL,
	"check_out_timestamp" timestamp with time zone NOT NULL,
	"scheduled_seconds" integer NOT NULL,
	"actual_worked_seconds" integer NOT NULL,
	"break_seconds" integer DEFAULT 0 NOT NULL,
	"net_worked_seconds" integer NOT NULL,
	"overtime_seconds" integer DEFAULT 0 NOT NULL,
	"undertime_seconds" integer DEFAULT 0 NOT NULL,
	"late_arrival_seconds" integer DEFAULT 0 NOT NULL,
	"early_exit_seconds" integer DEFAULT 0 NOT NULL,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"assigned_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_duration_seconds" integer DEFAULT 0 NOT NULL,
	"late_grace_seconds" integer DEFAULT 600 NOT NULL,
	"early_exit_grace_seconds" integer DEFAULT 600 NOT NULL,
	"overtime_threshold_seconds" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'employee' NOT NULL,
	"employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_token_id_attendance_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."attendance_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_ledger" ADD CONSTRAINT "attendance_ledger_attendance_event_id_attendance_events_id_fk" FOREIGN KEY ("attendance_event_id") REFERENCES "public"."attendance_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_ledger" ADD CONSTRAINT "attendance_ledger_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_ledger" ADD CONSTRAINT "attendance_ledger_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_tokens" ADD CONSTRAINT "attendance_tokens_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_attendance_event_id_attendance_events_id_fk" FOREIGN KEY ("attendance_event_id") REFERENCES "public"."attendance_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_events_duplicate_prevention_idx" ON "attendance_events" USING btree ("employee_id","event_type","event_date");--> statement-breakpoint
CREATE INDEX "attendance_events_employee_date_idx" ON "attendance_events" USING btree ("employee_id","event_date");--> statement-breakpoint
CREATE INDEX "attendance_events_date_idx" ON "attendance_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "attendance_ledger_employee_date_idx" ON "attendance_ledger" USING btree ("employee_id","event_date");--> statement-breakpoint
CREATE INDEX "attendance_ledger_date_idx" ON "attendance_ledger" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "attendance_ledger_event_id_idx" ON "attendance_ledger" USING btree ("attendance_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_tokens_token_hash_idx" ON "attendance_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "attendance_tokens_validation_idx" ON "attendance_tokens" USING btree ("employee_id","is_consumed","expires_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_category_idx" ON "audit_logs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_category_created_at_idx" ON "audit_logs" USING btree ("category","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "system_config_key_idx" ON "system_config" USING btree ("key");--> statement-breakpoint
CREATE INDEX "corrections_event_id_idx" ON "corrections" USING btree ("attendance_event_id");--> statement-breakpoint
CREATE INDEX "corrections_employee_status_idx" ON "corrections" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "corrections_corrected_by_idx" ON "corrections" USING btree ("corrected_by");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_employee_code_idx" ON "employees" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX "employees_department_idx" ON "employees" USING btree ("department");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employees_department_status_idx" ON "employees" USING btree ("department","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_records_employee_date_idx" ON "payroll_records" USING btree ("employee_id","period_date");--> statement-breakpoint
CREATE INDEX "payroll_records_period_date_idx" ON "payroll_records" USING btree ("period_date");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shift_assignments_employee_effective_to_idx" ON "shift_assignments" USING btree ("employee_id","effective_to");--> statement-breakpoint
CREATE INDEX "shift_assignments_employee_effective_from_idx" ON "shift_assignments" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "shift_assignments_shift_id_idx" ON "shift_assignments" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_employee_id_idx" ON "users" USING btree ("employee_id");