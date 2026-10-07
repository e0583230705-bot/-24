CREATE TABLE "audit_bank_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"account_code" text NOT NULL,
	"filename" text NOT NULL,
	"rows" jsonb NOT NULL,
	"balance_override" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_bank_statements" ADD CONSTRAINT "audit_bank_statements_engagement_id_audit_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."audit_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_bank_statements_account" ON "audit_bank_statements" USING btree ("engagement_id","account_code");