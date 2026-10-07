ALTER TABLE "audit_accounts" ADD COLUMN "trial_balance_code" text;--> statement-breakpoint
ALTER TABLE "audit_accounts" ADD COLUMN "trial_balance_name" text;--> statement-breakpoint
ALTER TABLE "audit_accounts" ADD COLUMN "classification" text;--> statement-breakpoint
ALTER TABLE "audit_engagements" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "audit_engagements" ADD COLUMN "source_meta" jsonb;--> statement-breakpoint
ALTER TABLE "audit_engagements" ADD COLUMN "import_issues" jsonb;