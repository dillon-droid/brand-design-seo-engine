import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db/client";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  findUserByEmail,
  readSessionCookie,
  requireAuth,
  setSessionCookie,
  verifyPassword,
  type AuthedUser,
} from "./lib/auth";
import { suggestKeywords, researchKeyword, generateArticle } from "./lib/anthropic";
import { fetchRankings, mineOpportunities } from "./lib/gsc";

type Env = { Variables: { user: AuthedUser } };
const app = new Hono<Env>().basePath("/api");

app.use("*", cors({ origin: "*", credentials: true }));

// ---- AUTH ----
app.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid email or password" }, 400);
  const user = await findUserByEmail(parsed.data.email);
  if (!user) return c.json({ error: "Invalid email or password" }, 401);
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return c.json({ error: "Invalid email or password" }, 401);
  const session = await createSession(user.id);
  setSessionCookie(c, session.id, session.expiresAt);
  return c.json({ ok: true });
});

app.post("/auth/logout", async (c) => {
  const id = readSessionCookie(c);
  if (id) await destroySession(id);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/auth/me", async (c) => {
  const id = readSessionCookie(c);
  if (!id) return c.json({ user: null });
  const { getSession } = await import("./lib/auth");
  const s = await getSession(id);
  if (!s) return c.json({ user: null });
  return c.json({ user: { id: s.user.id, email: s.user.email, name: s.user.name } });
});

// All routes below require auth
app.use("*", requireAuth);

// ---- COMPANIES ----
const companyInputShape = z.object({
  name: z.string().min(1),
  industry: z.string().default(""),
  location: z.string().default(""),
  domain: z.string().default(""),
  description: z.string().default(""),
  services: z.string().default(""),
  targetAudience: z.string().default(""),
  brandVoice: z.string().default(""),
  toneNotes: z.string().default(""),
  brandScript: z.string().default(""),
  sbHero: z.string().default(""),
  sbExternalProblem: z.string().default(""),
  sbInternalProblem: z.string().default(""),
  sbGuide: z.string().default(""),
  sbPlan: z.string().default(""),
  sbCta: z.string().default(""),
  sbSuccessVision: z.string().default(""),
  sbFailureStakes: z.string().default(""),
  sbBrandVoice: z.string().default(""),
});

app.get("/companies", async (c) => {
  const rows = await db.select().from(schema.companies).orderBy(desc(schema.companies.updatedAt));
  return c.json(rows);
});

app.post("/companies", async (c) => {
  const body = await c.req.json();
  const parsed = companyInputShape.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, 400);
  const [row] = await db.insert(schema.companies).values(parsed.data).returning();
  return c.json(row);
});

app.patch("/companies/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = companyInputShape.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid" }, 400);
  const [row] = await db
    .update(schema.companies)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.companies.id, id))
    .returning();
  return c.json(row);
});

app.delete("/companies/:id", async (c) => {
  await db.delete(schema.companies).where(eq(schema.companies.id, c.req.param("id")));
  return c.body(null, 204);
});

// ---- KEYWORDS ----

async function loadCompany(id?: string | null) {
  if (!id) return null;
  const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  return rows[0] ?? null;
}

app.post("/keywords/suggest", async (c) => {
  const { industry, companyId } = await c.req.json();
  if (!industry) return c.json({ error: "industry required" }, 400);
  const company = await loadCompany(companyId);
  const results = await suggestKeywords({ industry, company });
  await db.insert(schema.keywordSessions).values({
    companyId: companyId ?? null,
    mode: "suggest",
    industry,
    results,
  });
  return c.json({ results });
});

app.post("/keywords/research", async (c) => {
  const { seedKeyword, industry, companyId } = await c.req.json();
  if (!seedKeyword) return c.json({ error: "seedKeyword required" }, 400);
  const company = await loadCompany(companyId);
  const results = await researchKeyword({ seedKeyword, industry: industry || "", company });
  await db.insert(schema.keywordSessions).values({
    companyId: companyId ?? null,
    mode: "research",
    seedKeyword,
    industry: industry || "",
    results,
  });
  return c.json({ results });
});

app.post("/keywords/gsc-opportunities", async (c) => {
  const { siteUrl, days, companyId } = await c.req.json();
  if (!siteUrl) return c.json({ error: "siteUrl required" }, 400);
  const result = await mineOpportunities({ siteUrl, days: Number(days) || 90 });
  await db.insert(schema.keywordSessions).values({
    companyId: companyId ?? null,
    mode: "gsc-opportunities",
    gscSiteUrl: result.siteUrl,
    gscDays: Number(days) || 90,
    results: result.buckets,
  });
  return c.json(result);
});

app.get("/keywords/sessions", async (c) => {
  const companyId = c.req.query("companyId");
  const rows = companyId
    ? await db.select().from(schema.keywordSessions).where(eq(schema.keywordSessions.companyId, companyId)).orderBy(desc(schema.keywordSessions.createdAt)).limit(50)
    : await db.select().from(schema.keywordSessions).orderBy(desc(schema.keywordSessions.createdAt)).limit(50);
  return c.json(rows);
});

app.get("/keywords/saved", async (c) => {
  const companyId = c.req.query("companyId");
  const rows = companyId
    ? await db.select().from(schema.savedKeywords).where(eq(schema.savedKeywords.companyId, companyId)).orderBy(desc(schema.savedKeywords.createdAt))
    : await db.select().from(schema.savedKeywords).orderBy(desc(schema.savedKeywords.createdAt));
  return c.json(rows);
});

app.post("/keywords/saved", async (c) => {
  const body = await c.req.json();
  const { keyword, companyId, meta = {} } = body;
  if (!keyword) return c.json({ error: "keyword required" }, 400);
  const [row] = await db
    .insert(schema.savedKeywords)
    .values({
      keyword,
      companyId: companyId ?? null,
      searchVolume: meta.searchVolume ?? null,
      difficulty: meta.difficulty ?? null,
      competition: meta.competition ?? null,
      cpc: meta.cpc ?? null,
      intent: meta.intent ?? null,
      rationale: meta.rationale ?? null,
      targeted: false,
    })
    .returning();
  return c.json(row);
});

app.patch("/keywords/saved/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const [row] = await db
    .update(schema.savedKeywords)
    .set({ targeted: body.targeted })
    .where(eq(schema.savedKeywords.id, id))
    .returning();
  return c.json(row);
});

app.delete("/keywords/saved/:id", async (c) => {
  await db.delete(schema.savedKeywords).where(eq(schema.savedKeywords.id, c.req.param("id")));
  return c.body(null, 204);
});

// ---- RANKINGS ----
app.post("/rankings/fetch", async (c) => {
  const { siteUrl, days } = await c.req.json();
  if (!siteUrl) return c.json({ error: "siteUrl required" }, 400);
  const out = await fetchRankings({ siteUrl, days: Number(days) || 28 });
  return c.json(out);
});

// ---- ARTICLES ----
app.get("/articles", async (c) => {
  const rows = await db.select().from(schema.articles).orderBy(desc(schema.articles.createdAt));
  return c.json(rows);
});

app.get("/articles/:id", async (c) => {
  const rows = await db.select().from(schema.articles).where(eq(schema.articles.id, c.req.param("id"))).limit(1);
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json(rows[0]);
});

app.delete("/articles/:id", async (c) => {
  await db.delete(schema.articles).where(eq(schema.articles.id, c.req.param("id")));
  return c.body(null, 204);
});

app.post("/articles/generate", async (c) => {
  const body = await c.req.json();
  const schemaIn = z.object({
    companyId: z.string().optional(),
    targetKeyword: z.string().min(1),
    secondaryKeywords: z.array(z.string()).default([]),
    length: z.enum(["short", "medium", "long"]).default("medium"),
    whoIsTheReader: z.string().default(""),
    whatProblem: z.string().default(""),
    howDoesItMakeThemFeel: z.string().default(""),
    whyTrustYou: z.string().default(""),
    whatShouldTheyDo: z.string().default(""),
    whatDoesSuccessLook: z.string().default(""),
    whatHappensIfTheyDont: z.string().default(""),
  });
  const parsed = schemaIn.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, 400);
  const data = parsed.data;
  const company = await loadCompany(data.companyId);
  const article = await generateArticle({
    company,
    targetKeyword: data.targetKeyword,
    secondaryKeywords: data.secondaryKeywords,
    length: data.length,
    quizAnswers: {
      whoIsTheReader: data.whoIsTheReader,
      whatProblem: data.whatProblem,
      howDoesItMakeThemFeel: data.howDoesItMakeThemFeel,
      whyTrustYou: data.whyTrustYou,
      whatShouldTheyDo: data.whatShouldTheyDo,
      whatDoesSuccessLook: data.whatDoesSuccessLook,
      whatHappensIfTheyDont: data.whatHappensIfTheyDont,
    },
  });
  const [row] = await db
    .insert(schema.articles)
    .values({
      companyId: data.companyId ?? null,
      targetKeyword: data.targetKeyword,
      secondaryKeywords: data.secondaryKeywords,
      title: article.title,
      metaDescription: article.metaDescription,
      markdown: article.markdown,
      html: article.html,
      seoScore: article.seoScore,
      wordCount: article.wordCount,
      quizAnswers: {
        whoIsTheReader: data.whoIsTheReader,
        whatProblem: data.whatProblem,
        howDoesItMakeThemFeel: data.howDoesItMakeThemFeel,
        whyTrustYou: data.whyTrustYou,
        whatShouldTheyDo: data.whatShouldTheyDo,
        whatDoesSuccessLook: data.whatDoesSuccessLook,
        whatHappensIfTheyDont: data.whatHappensIfTheyDont,
      },
    })
    .returning();
  return c.json(row);
});

// ---- DASHBOARD ----
app.get("/dashboard", async (c) => {
  const [counts] = await db
    .select({
      articlesGenerated: sql<number>`count(*)::int`,
      avgSeoScore: sql<number>`coalesce(avg(${schema.articles.seoScore}), 0)::int`,
      totalWordCount: sql<number>`coalesce(sum(${schema.articles.wordCount}), 0)::int`,
    })
    .from(schema.articles);

  const [{ keywordsTargeted }] = await db
    .select({ keywordsTargeted: sql<number>`count(*)::int` })
    .from(schema.savedKeywords)
    .where(eq(schema.savedKeywords.targeted, true));

  const recentArticles = await db
    .select({
      id: schema.articles.id,
      title: schema.articles.title,
      targetKeyword: schema.articles.targetKeyword,
      createdAt: schema.articles.createdAt,
    })
    .from(schema.articles)
    .orderBy(desc(schema.articles.createdAt))
    .limit(5);

  const recentKeywords = await db
    .select({
      id: schema.savedKeywords.id,
      keyword: schema.savedKeywords.keyword,
      companyId: schema.savedKeywords.companyId,
      createdAt: schema.savedKeywords.createdAt,
    })
    .from(schema.savedKeywords)
    .orderBy(desc(schema.savedKeywords.createdAt))
    .limit(5);

  return c.json({
    articlesGenerated: counts?.articlesGenerated ?? 0,
    avgSeoScore: counts?.avgSeoScore ?? 0,
    totalWordCount: counts?.totalWordCount ?? 0,
    keywordsTargeted: keywordsTargeted ?? 0,
    recentArticles,
    recentKeywords,
  });
});

// Generic error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
});

export default app;
