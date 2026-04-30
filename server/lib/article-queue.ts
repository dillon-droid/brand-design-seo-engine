// Background processor for the article_jobs queue.
// Called by /api/cron/process-articles on a Vercel cron.
// Each invocation processes ONE pending job (article gen takes 60-90s; we want
// to stay under Vercel's serverless timeout).
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { generateArticle, generateSchemaForArticle, generateSeoMeta } from "./ai";

async function loadCompany(id: string | null) {
  if (!id) return null;
  const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically claim the oldest pending job (mark it processing) so two cron
 * invocations don't double-process. Uses Postgres UPDATE...RETURNING with a
 * sub-select on a single row.
 */
async function claimNextJob() {
  // Find the oldest pending job
  const candidates = await db
    .select({ id: schema.articleJobs.id })
    .from(schema.articleJobs)
    .where(eq(schema.articleJobs.status, "pending"))
    .orderBy(asc(schema.articleJobs.createdAt))
    .limit(1);
  const candidate = candidates[0];
  if (!candidate) return null;

  // Try to claim it (fails harmlessly if another worker beat us)
  const claimed = await db
    .update(schema.articleJobs)
    .set({ status: "processing", startedAt: new Date() })
    .where(and(eq(schema.articleJobs.id, candidate.id), eq(schema.articleJobs.status, "pending")))
    .returning();
  return claimed[0] ?? null;
}

export async function processNextJob(): Promise<{
  processed: boolean;
  jobId?: string;
  articleId?: string;
  error?: string;
}> {
  const job = await claimNextJob();
  if (!job) return { processed: false };

  try {
    const company = await loadCompany(job.companyId);
    const article = await generateArticle({
      company,
      targetKeyword: job.targetKeyword,
      secondaryKeywords: job.secondaryKeywords,
      length: (job.length as "short" | "medium" | "long") ?? "medium",
      quizAnswers: {
        whoIsTheReader: "",
        whatProblem: "",
        howDoesItMakeThemFeel: "",
        whyTrustYou: "",
        whatShouldTheyDo: "",
        whatDoesSuccessLook: "",
        whatHappensIfTheyDont: "",
      },
    });

    const [row] = await db
      .insert(schema.articles)
      .values({
        companyId: job.companyId,
        targetKeyword: job.targetKeyword,
        secondaryKeywords: job.secondaryKeywords,
        title: article.title,
        metaDescription: article.metaDescription,
        markdown: article.markdown,
        html: article.html,
        seoScore: article.seoScore,
        wordCount: article.wordCount,
        schemaJsonLd: "",
      })
      .returning();

    // Mark job done
    await db
      .update(schema.articleJobs)
      .set({ status: "done", articleId: row.id, completedAt: new Date() })
      .where(eq(schema.articleJobs.id, job.id));

    // Fire-and-forget supplementary content (don't block cron timeout)
    Promise.allSettled([
      generateSchemaForArticle({
        company,
        article: {
          title: article.title,
          metaDescription: article.metaDescription,
          markdown: article.markdown,
          html: article.html,
          targetKeyword: job.targetKeyword,
        },
      }).then((schemaJsonLd) =>
        schemaJsonLd
          ? db.update(schema.articles).set({ schemaJsonLd }).where(eq(schema.articles.id, row.id))
          : null,
      ),
      generateSeoMeta({
        company,
        article: {
          title: article.title,
          metaDescription: article.metaDescription,
          markdown: article.markdown,
          targetKeyword: job.targetKeyword,
          secondaryKeywords: job.secondaryKeywords,
        },
      }).then((seoMeta) =>
        db.update(schema.articles).set({ seoMeta }).where(eq(schema.articles.id, row.id)),
      ),
    ]).catch((err) => console.error("queue: supplementary content failed", err));

    chainNextJob();
    return { processed: true, jobId: job.id, articleId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.articleJobs)
      .set({ status: "failed", errorMessage: message, completedAt: new Date() })
      .where(eq(schema.articleJobs.id, job.id));
    chainNextJob();
    return { processed: true, jobId: job.id, error: message };
  }
}

/**
 * After completing a job, fire-and-forget a request to /api/cron/process-articles
 * so the NEXT pending job picks up immediately in a fresh serverless invocation
 * (rather than waiting up to N minutes for the next cron tick). Safe because
 * claimNextJob() races atomically — duplicate triggers are no-ops.
 */
function chainNextJob() {
  const secret = process.env.CRON_SECRET;
  const base = process.env.VERCEL_URL || process.env.SELF_BASE_URL;
  if (!secret || !base) return; // dev environment / not configured
  const url = base.startsWith("http") ? `${base}/api/cron/process-articles` : `https://${base}/api/cron/process-articles`;
  fetch(url, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => {
    // best-effort — cron will catch it on the next tick
  });
}
