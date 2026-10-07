CREATE TABLE "audit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"text" text NOT NULL,
	"author_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "audit_accounts_engagement_code";--> statement-breakpoint
DROP INDEX "audit_lines_engagement";--> statement-breakpoint
ALTER TABLE "audit_accounts" ADD COLUMN "period" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_engagements" ADD COLUMN "prior_source" jsonb;--> statement-breakpoint
ALTER TABLE "audit_lines" ADD COLUMN "period" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_notes" ADD CONSTRAINT "audit_notes_engagement_id_audit_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."audit_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_notes" ADD CONSTRAINT "audit_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_notes_engagement_item" ON "audit_notes" USING btree ("engagement_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_accounts_engagement_period_code" ON "audit_accounts" USING btree ("engagement_id","period","code");--> statement-breakpoint
CREATE INDEX "audit_lines_engagement" ON "audit_lines" USING btree ("engagement_id","period","date");