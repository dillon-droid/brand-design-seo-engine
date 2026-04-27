import Anthropic from "@anthropic-ai/sdk";
import type { schema } from "../db/client";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.warn("ANTHROPIC_API_KEY is not set — AI calls will fail");
}

export const anthropic = new Anthropic({ apiKey });

export const MODELS = {
  fast: "claude-sonnet-4-6",
  smart: "claude-opus-4-7",
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

function extractText(msg: Anthropic.Messages.Message): string {
  return msg.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  return JSON.parse(body) as T;
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

export async function suggestKeywords({
  industry,
  company,
}: {
  industry: string;
  company: Company | null;
}): Promise<KeywordResult[]> {
  const system = [
    {
      type: "text" as const,
      text: `You are an SEO strategist. Suggest 25 high-value keyword opportunities the client could target. Return STRICT JSON: {"results": [{"keyword": string, "searchVolume": number, "difficulty": number (0-100), "cpc": number (USD), "competition": "Low"|"Medium"|"High", "intent": "informational"|"commercial"|"transactional"|"navigational", "rationale": string}]}. Volumes/difficulty/CPC are best estimates.`,
    },
    {
      type: "text" as const,
      text: `CLIENT BRAND CONTEXT (cache this):\n${brandContext(company)}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const msg = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 4096,
    system,
    messages: [
      {
        role: "user",
        content: `Industry: ${industry}. Suggest 25 keywords with a healthy mix of head terms, mid-tail, and long-tail. Bias toward commercial intent for service businesses. JSON only.`,
      },
    ],
  });
  const out = parseJson<{ results: KeywordResult[] }>(extractText(msg));
  return out.results || [];
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
  const system = [
    {
      type: "text" as const,
      text: `You are an SEO strategist doing deep keyword research. For a seed keyword, return 30 related keywords organized as: 10 close variations, 10 long-tail opportunities, 10 questions people ask. JSON only: {"results": [{"keyword": string, "searchVolume": number, "difficulty": number, "cpc": number, "competition": string, "intent": string, "rationale": string}]}.`,
    },
    {
      type: "text" as const,
      text: `CLIENT BRAND CONTEXT:\n${brandContext(company)}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];
  const msg = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 6000,
    system,
    messages: [
      { role: "user", content: `Seed keyword: "${seedKeyword}". Industry: ${industry || "(unspecified)"}. Return 30 results as JSON.` },
    ],
  });
  return parseJson<{ results: KeywordResult[] }>(extractText(msg)).results || [];
}

export async function estimateDifficultyForQueries(queries: string[]): Promise<Record<string, number>> {
  if (queries.length === 0) return {};
  const msg = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 2000,
    system: `Estimate SEO keyword difficulty (0-100) for each query. JSON only: {"<query>": <number>, ...}`,
    messages: [{ role: "user", content: JSON.stringify(queries) }],
  });
  try {
    return parseJson<Record<string, number>>(extractText(msg));
  } catch {
    return {};
  }
}

export type GeneratedArticle = {
  title: string;
  metaDescription: string;
  markdown: string;
  html: string;
  seoScore: number;
  wordCount: number;
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

  const system = [
    {
      type: "text" as const,
      text: `You are a senior SEO content writer for Brand Design Co., a marketing agency that uses StoryBrand. Write articles in the client's brand voice that:
- Open with the reader's specific problem and emotional state
- Position the brand as the trusted guide
- Use SEO-optimized heading structure (H1 once, H2/H3 logical hierarchy)
- Include an FAQ section for featured snippets
- End with a clear, direct call-to-action
- Are formatted for both AI search direct-answer engines and Google
- Use a comparison table or numbered list once, naturally
- Use natural keyword placement (target keyword in H1, intro, one H2, conclusion; secondary keywords woven naturally — never stuffed)
- Include internal linking suggestions in [brackets]

Return STRICT JSON only:
{
  "title": "<60 char SEO title>",
  "metaDescription": "<150-160 char meta>",
  "markdown": "<full article in markdown>",
  "html": "<full article as semantic HTML, no <html>/<body> wrapper, just the article body>",
  "seoScore": <0-100>,
  "wordCount": <integer>
}`,
    },
    {
      type: "text" as const,
      text: `CLIENT BRAND CONTEXT (cache this):\n${brandContext(company)}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

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

Write the article. JSON only.`.trim();

  const msg = await anthropic.messages.create({
    model: MODELS.smart,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const out = parseJson<GeneratedArticle>(extractText(msg));
  // sanity: word count if missing
  if (!out.wordCount) out.wordCount = (out.markdown || "").split(/\s+/).filter(Boolean).length;
  if (!out.seoScore) out.seoScore = 75;
  return out;
}
