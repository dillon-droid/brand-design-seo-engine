import { GoogleGenAI, Type } from "@google/genai";
import type { schema } from "../db/client";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set — AI calls will fail");
}

const ai = new GoogleGenAI({ apiKey: apiKey ?? "" });

export const MODELS = {
  fast: "gemini-2.5-flash",
  smart: "gemini-2.5-pro",
} as const;

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
    // Pick model for this attempt: first 2 attempts use primary, then walk fallback chain
    let modelForAttempt = initialModel;
    if (attempt > 2 && fallbackChain.length > 0) {
      const idx = Math.min(attempt - 3, fallbackChain.length - 1);
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
      // Jittered exponential backoff: 1s, 2s, 4s, 8s, 16s, 16s
      const baseDelay = Math.min(1000 * 2 ** (attempt - 1), 16000);
      const jitter = Math.floor(Math.random() * 800);
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

  const r = await generateWithRetry({
    model: MODELS.fast,
    contents: `Industry: ${industry}. Suggest 25 keywords with a healthy mix of head terms, mid-tail, and long-tail. Bias toward commercial intent for service businesses.`,
    config: {
      systemInstruction: sys,
      responseMimeType: "application/json",
      responseSchema: KEYWORD_LIST_SCHEMA,
    },
  });
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

  const r = await generateWithRetry({
    model: MODELS.fast,
    contents: `Seed keyword: "${seedKeyword}". Industry: ${industry || "(unspecified)"}. Return 30 results.`,
    config: {
      systemInstruction: sys,
      responseMimeType: "application/json",
      responseSchema: KEYWORD_LIST_SCHEMA,
    },
  });
  return parseJson<{ results: KeywordResult[] }>(r.text ?? "").results || [];
}

export async function estimateDifficultyForQueries(queries: string[]): Promise<Record<string, number>> {
  if (queries.length === 0) return {};
  const r = await generateWithRetry({
    model: MODELS.fast,
    contents: JSON.stringify(queries),
    config: {
      systemInstruction: `Estimate SEO keyword difficulty (0-100) for each query. Return JSON: {"<query>": <number>, ...}`,
      responseMimeType: "application/json",
    },
  });
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

  const r = await generateWithRetry({
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
  });
  return (parseJson<{ keywords: string[] }>(r.text ?? "").keywords || []).slice(0, 8);
}

export type GeneratedArticle = {
  title: string;
  metaDescription: string;
  markdown: string;
  html: string;
  seoScore: number;
  wordCount: number;
};

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

  const sys = `You are a senior SEO content writer for Brand Design Co., a marketing agency that uses StoryBrand. Write articles in the client's brand voice that:
- Open with the reader's specific problem and emotional state
- Position the brand as the trusted guide
- Use SEO-optimized heading structure (H1 once, H2/H3 logical hierarchy)
- Include an FAQ section for featured snippets
- End with a clear, direct call-to-action
- Are formatted for both AI search direct-answer engines and Google
- Use a comparison table or numbered list once, naturally
- Use natural keyword placement (target keyword in H1, intro, one H2, conclusion; secondary keywords woven naturally — never stuffed)
- Include internal linking suggestions in [brackets]

For "html", return semantic HTML for the article body only — no <html>/<body> wrapper. For "title" stay under 60 chars. For "metaDescription" stay 150-160 chars.

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
    { fallbackChain: [MODELS.fast, "gemini-2.0-flash", MODELS.fast] },
  );
  const out = parseJson<GeneratedArticle>(r.text ?? "");
  if (!out.wordCount) out.wordCount = (out.markdown || "").split(/\s+/).filter(Boolean).length;
  if (!out.seoScore) out.seoScore = 75;
  return out;
}
