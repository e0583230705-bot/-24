CREATE TABLE "audit_payroll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"source_type" text DEFAULT 'form126' NOT NULL,
	"employer" jsonb NOT NULL,
	"employees" jsonb NOT NULL,
	"months" jsonb NOT NULL,
	"declared" jsonb NOT NULL,
	"issues" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_engagements" ADD COLUMN "payroll_config" jsonb;--> statement-breakpoint
ALTER TABLE "audit_payroll" ADD CONSTRAINT "audit_payroll_engagement_id_audit_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."audit_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_payroll_engagement" ON "audit_payroll" USING btree ("engagement_id");