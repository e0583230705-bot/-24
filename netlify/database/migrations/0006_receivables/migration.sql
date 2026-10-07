ALTER TABLE "documents" ADD COLUMN "paid_at" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "paid_via" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "related_document_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_related_document_id_documents_id_fk" FOREIGN KEY ("related_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;