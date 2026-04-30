import { pgTable, text, timestamp, integer, real, boolean, jsonb, uuid, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  // Google OAuth — populated when user clicks "Connect Google"
  googleEmail: text("google_email"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at", { withTimezone: true }),
  googleScopes: text("google_scopes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  industry: text("industry").default("").notNull(),
  location: text("location").default("").notNull(),
  domain: text("domain").default("").notNull(),
  description: text("description").default("").notNull(),
  services: text("services").default("").notNull(),
  targetAudience: text("target_audience").default("").notNull(),
  brandVoice: text("brand_voice").default("").notNull(),
  toneNotes: text("tone_notes").default("").notNull(),
  brandScript: text("brand_script").default("").notNull(),
  sbHero: text("sb_hero").default("").notNull(),
  sbExternalProblem: text("sb_external_problem").default("").notNull(),
  sbInternalProblem: text("sb_internal_problem").default("").notNull(),
  sbGuide: text("sb_guide").default("").notNull(),
  sbPlan: text("sb_plan").default("").notNull(),
  sbCta: text("sb_cta").default("").notNull(),
  sbSuccessVision: text("sb_success_vision").default("").notNull(),
  sbFailureStakes: text("sb_failure_stakes").default("").notNull(),
  sbBrandVoice: text("sb_brand_voice").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const keywordSessions = pgTable(
  "keyword_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    mode: text("mode").notNull(), // 'suggest' | 'research' | 'gsc-opportunities'
    seedKeyword: text("seed_keyword").default("").notNull(),
    industry: text("industry").default("").notNull(),
    gscSiteUrl: text("gsc_site_url").default("").notNull(),
    gscDays: integer("gsc_days"),
    results: jsonb("results").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ companyIdx: index("ks_company_idx").on(t.companyId) }),
);

export const savedKeywords = pgTable(
  "saved_keywords",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keyword: text("keyword").notNull(),
    searchVolume: integer("search_volume"),
    difficulty: integer("difficulty"),
    competition: text("competition"),
    competitionIndex: real("competition_index"),
    cpc: real("cpc"),
    intent: text("intent"),
    rationale: text("rationale"),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    targeted: boolean("targeted").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ companyIdx: index("sk_company_idx").on(t.companyId) }),
);

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    targetKeyword: text("target_keyword").notNull(),
    secondaryKeywords: jsonb("secondary_keywords").$type<string[]>().default([]).notNull(),
    metaDescription: text("meta_description").default("").notNull(),
    markdown: text("markdown").notNull(),
    html: text("html").notNull(),
    seoScore: integer("seo_score").default(0).notNull(),
    wordCount: integer("word_count").default(0).notNull(),
    quizAnswers: jsonb("quiz_answers").$type<Record<string, string>>().default({}).notNull(),
    schemaJsonLd: text("schema_json_ld").default("").notNull(),
    voiceReview: jsonb("voice_review").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ companyIdx: index("a_company_idx").on(t.companyId) }),
);
