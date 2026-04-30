import { GoogleGenAI, Type } from "@google/genai";
import type { schema } from "../db/client";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set — AI calls will fail");
}

const ai = new GoogleGenAI({ apiKey: apiKey ?? "" });

// Lead with gemini-2.0-flash for speed/stability (older = more spare capacity).
// 2.5 family is hyped & frequently 503s during peak hours. Quality is equivalent
// for structured-output keyword/short-text tasks.
export const MODELS = {
  fast: "gemini-2.0-flash",
  smart: "gemini-2.5-pro",
} as const;

// Fallback chains for when the primary is overloaded.
// generateWithRetry walks these across attempts.
// Verified live as of probe: gemini-2.0-flash, 2.0-flash-lite, 2.5-flash,
// 2.5-flash-lite, 2.5-pro. (1.5 series retired.)
const FAST_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
const SMART_CHAIN = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

type Company = typeof schema.companies.$inferSelect;

export function brandContext(company: Company | null | undefined): string {
  if (!company) return "(no client context provided)";
  const lines: string[] = [];
  lines.push(`Client: ${company.name}`);
  if (company.industry) lines.push(`Industry: ${company.industry}`);
  if (company.location) lines.push(`Location: ${company.location}`);
  if (company.domain) lines.push(`Domain: ${company.domain}`);
  if (company.description) lines.push(`Description: ${company.description}`);
  if (company.services) lines.push(`Services: ${company.services}`);
  if (company.targetAudience) lines.push(`Target audience: ${company.targetAudience}`);
  if (company.brandVoice) lines.push(`Brand voice notes: ${company.brandVoice}`);
  if (company.toneNotes) lines.push(`Tone notes: ${company.toneNotes}`);

  const sb: string[] = [];
  if (company.brandScript) sb.push(`Full BrandScript:\n${company.brandScript}`);
  else {
    if (company.sbHero) sb.push(`Hero (Customer): ${company.sbHero}`);
    if (company.sbExternalProblem) sb.push(`External Problem: ${company.sbExternalProblem}`);
    if (company.sbInternalProblem) sb.push(`Internal Problem: ${company.sbInternalProblem}`);
    if (company.sbGuide) sb.push(`Guide Positioning: ${company.sbGuide}`);
    if (company.sbPlan) sb.push(`Plan: ${company.sbPlan}`);
    if (company.sbCta) sb.push(`Direct CTA: ${company.sbCta}`);
    if (company.sbSuccessVision) sb.push(`Success Vision: ${company.sbSuccessVision}`);
    if (company.sbFailureStakes) sb.push(`Failure Stakes: ${company.sbFailureStakes}`);
    if (company.sbBrandVoice) sb.push(`Brand Voice: ${company.sbBrandVoice}`);
  }
  if (sb.length) lines.push("\nStoryBrand BrandScript:\n" + sb.join("\n"));
  return lines.join("\n");
}

function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  return JSON.parse(body) as T;
}

/**
 * Gemini occasionally returns 503 (UNAVAILABLE) and 429 (RESOURCE_EXHAUSTED) when the
 * region is overloaded. Retry with jittered exponential backoff. For high-stakes calls
 * (article generation), also walk down a chain of fallback models so we degrade
 * gracefully rather than failing.
 */
async function generateWithRetry(
  args: Parameters<typeof ai.models.generateContent>[0],
  options: { maxAttempts?: number; fallbackChain?: string[] } = {},
) {
  const { maxAttempts = 6, fallbackChain = [] } = options;
  // Build sequence of models we'll try across the retries.
  // First N attempts use the primary model; later attempts walk fallbackChain.
  const initialModel = args.model;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Pick model for this attempt: first attempt uses primary, then walk fallback chain
    // (jump models early — if the primary is overloaded, retrying the same one rarely helps)
    let modelForAttempt = initialModel;
    if (attempt > 1 && fallbackChain.length > 0) {
      const idx = Math.min(attempt - 2, fallbackChain.length - 1);
      modelForAttempt = fallbackChain[idx];
    }

    try {
      return await ai.models.generateContent({ ...args, model: modelForAttempt });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        /\b(503|429|500|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|overloaded|high demand|quota|deadline)\b/i.test(msg);
      if (!isRetryable || attempt === maxAttempts) break;
      // 429 = per-minute quota — need to wait at least until the next minute window
      // 503/500/UNAVAILABLE = try again sooner
      const isQuota = /\b(429|RESOURCE_EXHAUSTED|quota)\b/i.test(msg);
      const baseDelay = isQuota
        ? Math.min(15_000 + 1000 * 2 ** (attempt - 1), 30_000)
        : Math.min(1000 * 2 ** (attempt - 1), 16_000);
      const jitter = Math.floor(Math.random() * 1000);
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
    }
  }
  throw new Error(
    `AI is temporarily unavailable (${lastErr instanceof Error ? lastErr.message : "unknown"}). Try again in a moment.`,
  );
}

export type KeywordResult = {
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  cpc?: number;
  competition?: string;
  intent?: string;
  rationale?: string;
};

const KEYWORD_LIST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          keyword: { type: Type.STRING },
          searchVolume: { type: Type.NUMBER },
          difficulty: { type: Type.NUMBER },
          cpc: { type: Type.NUMBER },
          competition: { type: Type.STRING },
          intent: { type: Type.STRING },
          rationale: { type: Type.STRING },
        },
        propertyOrdering: ["keyword", "searchVolume", "difficulty", "cpc", "competition", "intent", "rationale"],
      },
    },
  },
};

export async function suggestKeywords({
  industry,
  company,
}: {
  industry: string;
  company: Company | null;
}): Promise<KeywordResult[]> {
  const sys = `You are an SEO strategist. Suggest 25 high-value keyword opportunities the client could target. Volumes/difficulty/CPC are best estimates. competition: Low|Medium|High. intent: informational|commercial|transactional|navigational.

CLIENT BRAND CONTEXT:
${brandContext(company)}`;

  const r = await generateWithRetry(
    {
      model: MODELS.fast,
      contents: `Industry: ${industry}. Suggest 25 keywords with a healthy mix of head terms, mid-tail, and long-tail. Bias toward commercial intent for service businesses.`,
      config: {
        systemInstruction: sys,
        responseMimeType: "application/json",
        responseSchema: KEYWORD_LIST_SCHEMA,
      },
    },
    { fallbackChain: FAST_CHAIN },
  );
  return parseJson<{ results: KeywordResult[] }>(r.text ?? "").results || [];
}

export async function researchKeyword({
  seedKeyword,
  industry,
  company,
}: {
  seedKeyword: string;
  industry: string;
  company: Company | null;
}): Promise<KeywordResult[]> {
  const sys = `You are an SEO strategist doing deep keyword research. For the seed keyword, return 30 related keywords organized as: 10 close variations, 10 long-tail opportunities, 10 questions people ask.

CLIENT BRAND CONTEXT:
${brandContext(company)}`;

  const r = await generateWithRetry(
    {
      model: MODELS.fast,
      contents: `Seed keyword: "${seedKeyword}". Industry: ${industry || "(unspecified)"}. Return 30 results.`,
      config: {
        systemInstruction: sys,
        responseMimeType: "application/json",
        responseSchema: KEYWORD_LIST_SCHEMA,
      },
    },
    { fallbackChain: FAST_CHAIN },
  );
  return parseJson<{ results: KeywordResult[] }>(r.text ?? "").results || [];
}

export async function estimateDifficultyForQueries(queries: string[]): Promise<Record<string, number>> {
  if (queries.length === 0) return {};
  const r = await generateWithRetry(
    {
      model: MODELS.fast,
      contents: JSON.stringify(queries),
      config: {
        systemInstruction: `Estimate SEO keyword difficulty (0-100) for each query. Return JSON: {"<query>": <number>, ...}`,
        responseMimeType: "application/json",
      },
    },
    { fallbackChain: FAST_CHAIN },
  );
  try {
    return parseJson<Record<string, number>>(r.text ?? "");
  } catch {
    return {};
  }
}

export async function suggestSecondaryKeywords({
  targetKeyword,
  company,
}: {
  targetKeyword: string;
  company: Company | null;
}): Promise<string[]> {
  const sys = `You suggest 6-8 secondary SEO keywords/phrases that should be naturally woven into an article targeting a primary keyword. They should be:
- Semantically related variations
- Long-tail expansions (e.g. "best", "near me", "vs", "how to", "cost")
- Common questions
- Adjacent commercial intent terms

Return JSON: {"keywords": [string]}.

CLIENT CONTEXT:
${brandContext(company)}`;

  const r = await generateWithRetry(
    {
      model: MODELS.fast,
      contents: `Primary target keyword: "${targetKeyword}". Suggest 6-8 secondary keywords.`,
      config: {
        systemInstruction: sys,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    },
    { fallbackChain: FAST_CHAIN },
  );
  return (parseJson<{ keywords: string[] }>(r.text ?? "").keywords || []).slice(0, 8);
}

export type GeneratedArticle = {
  title: string;
  metaDescription: string;
  markdown: string;
  html: string;
  seoScore: number;
  wordCount: number;
  schemaJsonLd: string; // populated by a separate generateSchemaForArticle call after article is generated
};

// Article generation schema: schemaJsonLd is intentionally NOT included here.
// Including it caused the model to occasionally truncate or omit `markdown`
// because escaping a JSON-LD string inside a structured JSON response is
// hard for the model to get right. Schema is now generated in a follow-up call.
const ARTICLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    metaDescription: { type: Type.STRING },
    markdown: { type: Type.STRING },
    html: { type: Type.STRING },
    seoScore: { type: Type.NUMBER },
    wordCount: { type: Type.NUMBER },
  },
  required: ["title", "metaDescription", "markdown", "html"],
  propertyOrdering: ["title", "metaDescription", "markdown", "html", "seoScore", "wordCount"],
};

export async function generateArticle({
  company,
  targetKeyword,
  secondaryKeywords,
  quizAnswers,
  length,
}: {
  company: Company | null;
  targetKeyword: string;
  secondaryKeywords: string[];
  quizAnswers: Record<string, string>;
  length: "short" | "medium" | "long";
}): Promise<GeneratedArticle> {
  const wordTarget = length === "short" ? 800 : length === "long" ? 2500 : 1500;

  const sys = `You are a senior SEO content writer for Brand Design Co., a marketing agency that uses StoryBrand. Write articles for both Google AND AI search engines (Perplexity, ChatGPT, Google AI Overviews).

REQUIRED ARTICLE STRUCTURE (in this order):
1. **H1** with the target keyword
2. **TL;DR section** — labeled exactly "## TL;DR" (markdown) or <h2>TL;DR</h2> (html). 3–4 sentences max. This is the section AI search engines extract — make it dense, declarative, and answer the reader's core question outright.
3. **Hook intro** — open with the reader's specific problem and emotional state (StoryBrand). 2–3 paragraphs.
4. **H2 sections** — each H2 MUST be followed immediately by a 40–60-word direct-answer paragraph (no fluff, no preamble, just the answer to the H2 question). Then expand with details, sub-H3s, examples.
5. **Use one comparison table or numbered list** somewhere natural.
6. **FAQ section** — at least 4 question/answer pairs, each Q phrased as a real search query.
7. **Clear, direct CTA** at the end (use the company's StoryBrand CTA when available).

OTHER REQUIREMENTS:
- Position the brand as the trusted guide (StoryBrand framework — empathy + authority).
- Natural keyword placement: target keyword in H1, TL;DR, intro, one H2, and CTA. Secondary keywords woven in — never stuffed.
- Internal linking: where you'd naturally link to another article on the site, hint with [bracketed anchor text].

OUTPUT FIELDS:
- "html": semantic HTML for the article body only — no <html>/<body> wrapper.
- "title": <60 chars, contains target keyword.
- "metaDescription": 150–160 chars, contains target keyword.
- "markdown": the same article in markdown.
- "seoScore": 0–100 self-assessment.
- "wordCount": integer.

CLIENT BRAND CONTEXT:
${brandContext(company)}`;

  const userPrompt = `
Target keyword: ${targetKeyword}
Secondary keywords: ${secondaryKeywords.length ? secondaryKeywords.join(", ") : "(none)"}
Length target: ~${wordTarget} words

StoryBrand quiz answers from the writer:
- Who is the reader: ${quizAnswers.whoIsTheReader || "(not provided)"}
- What problem made them search: ${quizAnswers.whatProblem || "(not provided)"}
- How does the problem make them feel: ${quizAnswers.howDoesItMakeThemFeel || "(not provided)"}
- Why should they trust us: ${quizAnswers.whyTrustYou || "(not provided)"}
- What should they do after reading: ${quizAnswers.whatShouldTheyDo || "(not provided)"}
- What does success look like: ${quizAnswers.whatDoesSuccessLook || "(not provided)"}
- What happens if they don't act: ${quizAnswers.whatHappensIfTheyDont || "(not provided)"}

Write the article.`.trim();

  const r = await generateWithRetry(
    {
      model: MODELS.smart,
      contents: userPrompt,
      config: {
        systemInstruction: sys,
        responseMimeType: "application/json",
        responseSchema: ARTICLE_SCHEMA,
      },
    },
    { fallbackChain: SMART_CHAIN },
  );
  const out = parseJson<GeneratedArticle>(r.text ?? "");
  if (!out.markdown || !out.html || !out.title) {
    throw new Error(
      `AI returned an incomplete article (missing ${!out.markdown ? "markdown" : !out.html ? "html" : "title"}). Try regenerating.`,
    );
  }
  if (!out.wordCount) out.wordCount = out.markdown.split(/\s+/).filter(Boolean).length;
  if (!out.seoScore) out.seoScore = 75;
  out.schemaJsonLd = ""; // populated separately below by the caller
  return out;
}

export type SeoMeta = {
  tldr: string;
  keywords: string[];
  slug: string;
  readTimeMinutes: number;
  pullQuotes: string[];
  imagePrompts: Array<{ placement: string; prompt: string; altText: string }>;
  socialSnippets: { linkedin: string; twitter: string };
  openGraph: { title: string; description: string; imageAlt: string };
  internalLinkSuggestions: Array<{ anchorText: string; topicToLinkTo: string }>;
};

const SEO_META_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tldr: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    slug: { type: Type.STRING },
    readTimeMinutes: { type: Type.NUMBER },
    pullQuotes: { type: Type.ARRAY, items: { type: Type.STRING } },
    imagePrompts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          placement: { type: Type.STRING },
          prompt: { type: Type.STRING },
          altText: { type: Type.STRING },
        },
        propertyOrdering: ["placement", "prompt", "altText"],
      },
    },
    socialSnippets: {
      type: Type.OBJECT,
      properties: {
        linkedin: { type: Type.STRING },
        twitter: { type: Type.STRING },
      },
      propertyOrdering: ["linkedin", "twitter"],
    },
    openGraph: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        imageAlt: { type: Type.STRING },
      },
      propertyOrdering: ["title", "description", "imageAlt"],
    },
    internalLinkSuggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          anchorText: { type: Type.STRING },
          topicToLinkTo: { type: Type.STRING },
        },
        propertyOrdering: ["anchorText", "topicToLinkTo"],
      },
    },
  },
  required: ["tldr", "keywords", "slug", "readTimeMinutes", "pullQuotes", "imagePrompts", "socialSnippets", "openGraph", "internalLinkSuggestions"],
};

export async function generateSeoMeta({
  company,
  article,
}: {
  company: Company | null;
  article: { title: string; metaDescription: string; markdown: string; targetKeyword: string; secondaryKeywords: string[] };
}): Promise<SeoMeta> {
  const sys = `You are an SEO + content distribution specialist. For the article below, produce structured supplementary content the writer can paste into a CMS (like GoHighLevel) or social channels.

FIELD GUIDANCE:
- "tldr": 3–4 sentence dense summary that answers the reader's core question. AI search extracts this; make it stand alone.
- "keywords": 8–12 keywords/phrases as a comma-ready array. Mix the target keyword, secondary keywords, and natural variations. Pasteable into a CMS "Meta Keywords" field.
- "slug": SEO-friendly URL slug (lowercase, hyphens, ~60 chars max, no stopwords if avoidable).
- "readTimeMinutes": realistic estimate based on word count (~200 wpm).
- "pullQuotes": 2–3 quotable lines lifted verbatim from the article — strong, specific, tweetable.
- "imagePrompts": 4–5 image briefs. For each: placement (e.g. "Hero image", "After H2 Section 2", "Pull quote backdrop"), prompt (a vivid, ready-to-paste prompt for Midjourney/DALL-E/ChatGPT — describe subject, style, mood, lighting, color palette, NOT just keywords), altText (descriptive alt text for screen readers + SEO).
- "socialSnippets.linkedin": LinkedIn post version (150–250 words, hook in first line, 3–5 paragraphs, ends with question or CTA, no hashtags).
- "socialSnippets.twitter": Twitter/X thread (5–7 tweets, numbered, each ≤270 chars, hook tweet first, last tweet has CTA).
- "openGraph.title": 60-char OG/Twitter card title (slightly more clickbait than meta title is OK).
- "openGraph.description": 200-char OG description.
- "openGraph.imageAlt": alt text for the share image.
- "internalLinkSuggestions": 3–6 entries identifying anchor phrases in the article that should link to other articles on the same site, with topicToLinkTo describing the topic the destination article should cover.

Return JSON only.

CLIENT CONTEXT:
${brandContext(company)}`;

  const r = await generateWithRetry(
    {
      model: MODELS.fast,
      contents: `Article title: ${article.title}\nMeta: ${article.metaDescription}\nTarget keyword: ${article.targetKeyword}\nSecondary keywords: ${article.secondaryKeywords.join(", ") || "(none)"}\n\nArticle markdown:\n${article.markdown}`,
      config: {
        systemInstruction: sys,
        responseMimeType: "application/json",
        responseSchema: SEO_META_SCHEMA,
      },
    },
    { fallbackChain: FAST_CHAIN },
  );
  const out = parseJson<SeoMeta>(r.text ?? "");
  return {
    tldr: out.tldr ?? "",
    keywords: out.keywords ?? [],
    slug: out.slug ?? "",
    readTimeMinutes: out.readTimeMinutes ?? 0,
    pullQuotes: out.pullQuotes ?? [],
    imagePrompts: out.imagePrompts ?? [],
    socialSnippets: out.socialSnippets ?? { linkedin: "", twitter: "" },
    openGraph: out.openGraph ?? { title: "", description: "", imageAlt: "" },
    internalLinkSuggestions: out.internalLinkSuggestions ?? [],
  };
}

/**
 * Second-pass call: produce JSON-LD schema markup for a saved article.
 * Done as a separate request because nesting a stringified JSON inside a
 * structured-output JSON response was unreliable — the model would
 * occasionally truncate the article body to fit.
 */
export async function generateSchemaForArticle({
  company,
  article,
}: {
  company: Company | null;
  article: { title: string; metaDescription: string; markdown: string; html: string; targetKeyword: string };
}): Promise<string> {
  const sys = `You generate schema.org JSON-LD for an SEO article.

Return a single JSON object with shape:
{ "jsonLd": "<stringified JSON-LD>" }

The "jsonLd" string MUST be valid JSON that can be pasted into a <script type="application/ld+json"> tag. Use a top-level "@graph" array containing:
1. An "Article" object (headline, description, articleBody as a brief summary, datePublished as today's ISO date, author = the company name).
2. An "FAQPage" object IF (and only if) the article has a Q&A/FAQ section. Map each Q&A to a Question/Answer node.

Return JSON only — no markdown, no commentary.

CLIENT CONTEXT:
${brandContext(company)}`;

  const r = await generateWithRetry(
    {
      model: MODELS.fast,
      contents: `Article title: ${article.title}\nTarget keyword: ${article.targetKeyword}\nMeta: ${article.metaDescription}\n\nArticle markdown:\n${article.markdown}`,
      config: {
        systemInstruction: sys,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { jsonLd: { type: Type.STRING } },
          required: ["jsonLd"],
        },
      },
    },
    { fallbackChain: FAST_CHAIN },
  );
  const out = parseJson<{ jsonLd: string }>(r.text ?? "");
  return out.jsonLd ?? "";
}

export type VoiceReview = {
  score: number; // 0-100 — how on-brand
  summary: string;
  strengths: string[];
  issues: Array<{ severity: "low" | "medium" | "high"; quote: string; problem: string; suggestion: string }>;
};

const REVIEW_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER },
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          severity: { type: Type.STRING },
          quote: { type: Type.STRING },
          problem: { type: Type.STRING },
          suggestion: { type: Type.STRING },
        },
        propertyOrdering: ["severity", "quote", "problem", "suggestion"],
      },
    },
  },
  propertyOrdering: ["score", "summary", "strengths", "issues"],
};

export async function reviewArticleVoice({
  company,
  article,
}: {
  company: Company | null;
  article: { title: string; markdown: string; targetKeyword: string };
}): Promise<VoiceReview> {
  const sys = `You are a senior brand-voice editor at Brand Design Co. Review the article below and check whether it actually matches the client's saved StoryBrand BrandScript and brand voice. Be specific, surgical, and honest — but constructive.

Score 0-100 (100 = perfectly on-brand).
List 3-5 strengths (what's working).
List specific issues with verbatim quotes from the article, classified by severity:
- high: outright contradicts the BrandScript or violates the brand voice
- medium: mismatch in tone/audience/positioning that would feel "off" to the client
- low: minor wording, missed opportunity to reinforce the brand

For each issue: provide the exact quote from the article, what's wrong, and a concrete one-line suggestion.

CLIENT BRAND CONTEXT:
${brandContext(company)}

Return JSON only.`;

  const r = await generateWithRetry(
    {
      model: MODELS.fast,
      contents: `Article title: "${article.title}"\nTarget keyword: ${article.targetKeyword}\n\nArticle (markdown):\n${article.markdown}`,
      config: {
        systemInstruction: sys,
        responseMimeType: "application/json",
        responseSchema: REVIEW_SCHEMA,
      },
    },
    { fallbackChain: FAST_CHAIN },
  );
  const out = parseJson<VoiceReview>(r.text ?? "");
  return {
    score: out.score ?? 0,
    summary: out.summary ?? "",
    strengths: out.strengths ?? [],
    issues: out.issues ?? [],
  };
}
