CREATE TABLE "audit_payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"sheet" text,
	"headers" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_payslips" ADD CONSTRAINT "audit_payslips_engagement_id_audit_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."audit_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_payslips_engagement" ON "audit_payslips" USING btree ("engagement_id");