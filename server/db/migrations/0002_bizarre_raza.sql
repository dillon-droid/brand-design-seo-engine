ALTER TABLE "articles" ADD COLUMN "schema_json_ld" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "voice_review" jsonb;