CREATE TABLE IF NOT EXISTS "article_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"page" text,
	"position" real NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"ctr" real DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "published_url" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ga4_property_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_rankings" ADD CONSTRAINT "article_rankings_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ar_article_idx" ON "article_rankings" USING btree ("article_id","fetched_at");