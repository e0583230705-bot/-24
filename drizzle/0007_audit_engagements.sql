CREATE TABLE "audit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"opening_balance" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"client_tax_id" text,
	"fiscal_year" integer NOT NULL,
	"year_end" date NOT NULL,
	"materiality_basis" text,
	"materiality_base" integer,
	"materiality_pct" double precision,
	"sample_seed" integer NOT NULL,
	"source_filename" text,
	"imported_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"entry_id" text NOT NULL,
	"date" date NOT NULL,
	"account_code" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"reference" text
);
--> statement-breakpoint
ALTER TABLE "audit_accounts" ADD CONSTRAINT "audit_accounts_engagement_id_audit_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."audit_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_engagements" ADD CONSTRAINT "audit_engagements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_engagements" ADD CONSTRAINT "audit_engagements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_lines" ADD CONSTRAINT "audit_lines_engagement_id_audit_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."audit_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_accounts_engagement_code" ON "audit_accounts" USING btree ("engagement_id","code");--> statement-breakpoint
CREATE INDEX "audit_engagements_org" ON "audit_engagements" USING btree ("organization_id","fiscal_year");--> statement-breakpoint
CREATE INDEX "audit_lines_engagement" ON "audit_lines" USING btree ("engagement_id","date");