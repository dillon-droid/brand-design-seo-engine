// Snapshots article rankings from GSC into article_rankings.
// Run by /api/cron/rankings (Vercel cron) and on-demand from the UI.
import { google, type Auth } from "googleapis";
import { db, schema } from "../db/client";
import { eq, and, isNotNull, desc, gte, sql } from "drizzle-orm";

type OAuth2Client = Auth.OAuth2Client;

function dateRange(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

type Article = typeof schema.articles.$inferSelect;

/**
 * For one article, query GSC for its target keyword on the company's domain
 * (filtered by the published page URL when available). Insert one snapshot row.
 */
export async function snapshotArticle({
  auth,
  article,
  companyDomain,
  days = 28,
}: {
  auth: OAuth2Client;
  article: Article;
  companyDomain: string | null;
  days?: number;
}): Promise<{ inserted: boolean; reason?: string }> {
  if (!companyDomain) return { inserted: false, reason: "no domain on company" };

  const sc = google.searchconsole({ version: "v1", auth });
  const { startDate, endDate } = dateRange(days);

  // Resolve site URL
  const { data: sitesData } = await sc.sites.list();
  const sites = (sitesData.siteEntry || []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
  const norm = companyDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
  const match = sites.find((s) => s.siteUrl?.toLowerCase() === `sc-domain:${norm}` || s.siteUrl?.toLowerCase().includes(norm));
  if (!match?.siteUrl) return { inserted: false, reason: `no GSC site for ${companyDomain}` };

  // Build the request: filter by the article's target keyword.
  // If we have a publishedUrl, also filter by that page so we get the right ranking.
  const filters: Array<{ dimension: string; operator: string; expression: string }> = [
    { dimension: "query", operator: "equals", expression: article.targetKeyword },
  ];
  if (article.publishedUrl) {
    filters.push({ dimension: "page", operator: "equals", expression: article.publishedUrl });
  }

  const { data: report } = await sc.searchanalytics.query({
    siteUrl: match.siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: 5,
      dimensionFilterGroups: [{ filters }],
      dataState: "final",
    },
  });
  const row = report.rows?.[0];
  if (!row) return { inserted: false, reason: "no GSC data for keyword/page" };

  await db.insert(schema.articleRankings).values({
    articleId: article.id,
    keyword: article.targetKeyword,
    page: row.keys?.[1] ?? article.publishedUrl,
    position: row.position ?? 0,
    impressions: row.impressions ?? 0,
    clicks: row.clicks ?? 0,
    ctr: row.ctr ?? 0,
  });
  return { inserted: true };
}

/**
 * Daily-ish job. Iterates every article that has a target keyword and a
 * company with a domain, and snapshots its current ranking using the FIRST
 * user who has Google connected. Skips snapshots taken in the last 18 hours
 * so we don't double-count if cron + manual-refresh both fire.
 */
export async function runDailySnapshot(): Promise<{ scanned: number; inserted: number; skipped: number; errors: string[] }> {
  // Pick any user with OAuth tokens
  const users = await db
    .select({ id: schema.users.id, refresh: schema.users.googleRefreshToken })
    .from(schema.users)
    .where(isNotNull(schema.users.googleRefreshToken))
    .limit(5);

  if (users.length === 0) {
    return { scanned: 0, inserted: 0, skipped: 0, errors: ["no user has Google connected"] };
  }

  const { getUserClient } = await import("./google-oauth");

  // Get all articles with a company that has a domain
  const articlesWithCompany = await db
    .select({
      article: schema.articles,
      companyDomain: schema.companies.domain,
    })
    .from(schema.articles)
    .leftJoin(schema.companies, eq(schema.articles.companyId, schema.companies.id));

  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  // For each article, check if a recent snapshot exists; if not, take one
  const eighteenHoursAgo = new Date(Date.now() - 18 * 3600_000);

  for (const { article, companyDomain } of articlesWithCompany) {
    if (!article.targetKeyword || !companyDomain) {
      skipped++;
      continue;
    }
    const recent = await db
      .select({ id: schema.articleRankings.id })
      .from(schema.articleRankings)
      .where(and(eq(schema.articleRankings.articleId, article.id), gte(schema.articleRankings.fetchedAt, eighteenHoursAgo)))
      .limit(1);
    if (recent.length > 0) {
      skipped++;
      continue;
    }

    // Try each user's OAuth until one succeeds
    let success = false;
    for (const u of users) {
      const auth = await getUserClient(u.id);
      if (!auth) continue;
      try {
        const r = await snapshotArticle({ auth, article, companyDomain });
        if (r.inserted) {
          inserted++;
          success = true;
          break;
        }
        // No data for this article — fine, don't try other users
        break;
      } catch (err) {
        errors.push(`article=${article.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!success && errors.length === 0) skipped++;
  }

  return { scanned: articlesWithCompany.length, inserted, skipped, errors };
}

/** Latest + history for a single article. */
export async function getArticleRankHistory(articleId: string, days = 90) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select()
    .from(schema.articleRankings)
    .where(and(eq(schema.articleRankings.articleId, articleId), gte(schema.articleRankings.fetchedAt, since)))
    .orderBy(desc(schema.articleRankings.fetchedAt))
    .limit(200);
  return rows;
}

/** Latest snapshot for each article in a company (for the company dashboard). */
export async function getCompanyArticleRankings(companyId: string) {
  // Get all articles for the company
  const articles = await db
    .select({ id: schema.articles.id, title: schema.articles.title, targetKeyword: schema.articles.targetKeyword })
    .from(schema.articles)
    .where(eq(schema.articles.companyId, companyId));
  if (articles.length === 0) return [];

  // For each article, fetch its 2 most recent snapshots so we can compute delta
  const result: Array<{
    articleId: string;
    title: string;
    targetKeyword: string;
    latest: { position: number; impressions: number; clicks: number; ctr: number; fetchedAt: string } | null;
    previous: { position: number; fetchedAt: string } | null;
    delta: number | null; // negative = position improved (lower #)
  }> = [];

  for (const a of articles) {
    const snaps = await db
      .select()
      .from(schema.articleRankings)
      .where(eq(schema.articleRankings.articleId, a.id))
      .orderBy(desc(schema.articleRankings.fetchedAt))
      .limit(2);
    const [latest, previous] = snaps;
    result.push({
      articleId: a.id,
      title: a.title,
      targetKeyword: a.targetKeyword,
      latest: latest
        ? {
            position: latest.position,
            impressions: latest.impressions,
            clicks: latest.clicks,
            ctr: latest.ctr,
            fetchedAt: latest.fetchedAt.toISOString(),
          }
        : null,
      previous: previous
        ? { position: previous.position, fetchedAt: previous.fetchedAt.toISOString() }
        : null,
      delta: latest && previous ? latest.position - previous.position : null,
    });
  }
  return result;
}

// satisfy unused import lint
void sql;
