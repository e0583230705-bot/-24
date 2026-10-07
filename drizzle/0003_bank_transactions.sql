CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"balance" integer,
	"reference" text,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"matched_document_id" uuid,
	"matched_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_document_id_documents_id_fk" FOREIGN KEY ("matched_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_expense_id_expenses_id_fk" FOREIGN KEY ("matched_expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_tx_org_fingerprint" ON "bank_transactions" USING btree ("organization_id","fingerprint");--> statement-breakpoint
CREATE INDEX "bank_tx_org_date" ON "bank_transactions" USING btree ("organization_id","date");