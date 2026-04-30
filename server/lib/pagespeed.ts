// Google PageSpeed Insights API. Free tier (no API key) is rate-limited to a few
// QPS and ~25k/day. Adding an API key (we already have GEMINI_API_KEY which is a
// Google API key with PageSpeed enabled if the project enabled it) raises limits.
//
// Returns Core Web Vitals (LCP, INP, CLS) for both mobile and desktop strategies
// in a compact shape.

export type CwvMetric = {
  value: number; // numeric value (ms for LCP/INP, unitless for CLS)
  display: string; // formatted, e.g. "2.1 s", "85 ms", "0.05"
  category: "FAST" | "AVERAGE" | "SLOW" | "UNKNOWN";
};

export type PageSpeedResult = {
  url: string;
  strategy: "mobile" | "desktop";
  performanceScore: number | null; // 0-100
  lcp: CwvMetric | null;
  inp: CwvMetric | null;
  cls: CwvMetric | null;
  fetchedAt: string;
};

const BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function categorize(p?: string): CwvMetric["category"] {
  if (!p) return "UNKNOWN";
  if (p === "FAST") return "FAST";
  if (p === "AVERAGE") return "AVERAGE";
  if (p === "SLOW") return "SLOW";
  return "UNKNOWN";
}

function metric(audit: any): CwvMetric | null {
  if (!audit) return null;
  const value = audit.numericValue ?? 0;
  return {
    value,
    display: audit.displayValue ?? String(value),
    category: categorize(audit.score === 1 ? "FAST" : audit.score >= 0.5 ? "AVERAGE" : "SLOW"),
  };
}

export async function checkPageSpeed(url: string, strategy: "mobile" | "desktop" = "mobile"): Promise<PageSpeedResult> {
  const params = new URLSearchParams({
    url,
    strategy,
    category: "PERFORMANCE",
  });
  // PageSpeed accepts the same Generative Language API key for the same project
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(`${BASE}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PageSpeed API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const audits = data.lighthouseResult?.audits ?? {};
  const cat = data.lighthouseResult?.categories?.performance;

  return {
    url,
    strategy,
    performanceScore: cat?.score != null ? Math.round(cat.score * 100) : null,
    lcp: metric(audits["largest-contentful-paint"]),
    inp: metric(audits["interactive"] || audits["interaction-to-next-paint"]),
    cls: metric(audits["cumulative-layout-shift"]),
    fetchedAt: new Date().toISOString(),
  };
}

export async function checkPageSpeedBoth(url: string): Promise<{ mobile: PageSpeedResult; desktop: PageSpeedResult }> {
  const [mobile, desktop] = await Promise.all([
    checkPageSpeed(url, "mobile"),
    checkPageSpeed(url, "desktop"),
  ]);
  return { mobile, desktop };
}
