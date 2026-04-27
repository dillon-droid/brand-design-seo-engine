CREATE TABLE IF NOT EXISTS "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"title" text NOT NULL,
	"target_keyword" text NOT NULL,
	"secondary_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_description" text DEFAULT '' NOT NULL,
	"markdown" text NOT NULL,
	"html" text NOT NULL,
	"seo_score" integer DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"quiz_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"domain" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"services" text DEFAULT '' NOT NULL,
	"target_audience" text DEFAULT '' NOT NULL,
	"brand_voice" text DEFAULT '' NOT NULL,
	"tone_notes" text DEFAULT '' NOT NULL,
	"brand_script" text DEFAULT '' NOT NULL,
	"sb_hero" text DEFAULT '' NOT NULL,
	"sb_external_problem" text DEFAULT '' NOT NULL,
	"sb_internal_problem" text DEFAULT '' NOT NULL,
	"sb_guide" text DEFAULT '' NOT NULL,
	"sb_plan" text DEFAULT '' NOT NULL,
	"sb_cta" text DEFAULT '' NOT NULL,
	"sb_success_vision" text DEFAULT '' NOT NULL,
	"sb_failure_stakes" text DEFAULT '' NOT NULL,
	"sb_brand_voice" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keyword_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"mode" text NOT NULL,
	"seed_keyword" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"gsc_site_url" text DEFAULT '' NOT NULL,
	"gsc_days" integer,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"search_volume" integer,
	"difficulty" integer,
	"competition" text,
	"competition_index" real,
	"cpc" real,
	"intent" text,
	"rationale" text,
	"company_id" uuid,
	"targeted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "articles" ADD CONSTRAINT "articles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "keyword_sessions" ADD CONSTRAINT "keyword_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_keywords" ADD CONSTRAINT "saved_keywords_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a_company_idx" ON "articles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ks_company_idx" ON "keyword_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sk_company_idx" ON "saved_keywords" USING btree ("company_id");