import { google } from "googleapis";

function getCreds() {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (!b64) throw new Error("GOOGLE_SA_KEY_B64 is not set");
  const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  return json as { client_email: string; private_key: string };
}

function searchconsole() {
  const creds = getCreds();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return google.searchconsole({ version: "v1", auth });
}

function dateRange(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function resolveSiteUrl(domain: string): Promise<string> {
  const sc = searchconsole();
  const { data } = await sc.sites.list();
  const sites = (data.siteEntry || []).map((s) => s.siteUrl).filter(Boolean) as string[];
  const norm = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
  // prefer domain property
  const domainProp = sites.find((s) => s === `sc-domain:${norm}` || s.toLowerCase().includes(`sc-domain:${norm}`));
  if (domainProp) return domainProp;
  // then https://www.x/
  const urlProp = sites.find((s) => s.toLowerCase().includes(norm));
  if (urlProp) return urlProp;
  if (domain.startsWith("sc-domain:") || domain.startsWith("http")) return domain;
  throw new Error(`No verified GSC property matches "${domain}". Make sure the service account is granted access.`);
}

export type RankingRow = {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

async function querySearchAnalytics(siteUrl: string, days: number, dimensions: string[]) {
  const sc = searchconsole();
  const { startDate, endDate } = dateRange(days);
  const all: any[] = [];
  let startRow = 0;
  const rowLimit = 5000;
  while (true) {
    const { data } = await sc.searchanalytics.query({
      siteUrl,
      requestBody: { startDate, endDate, dimensions, rowLimit, startRow, dataState: "final" as any },
    });
    const rows = data.rows || [];
    all.push(...rows);
    if (rows.length < rowLimit) break;
    startRow += rowLimit;
    if (startRow >= 25_000) break;
  }
  return all;
}

export async function fetchRankings({
  siteUrl: input,
  days,
}: {
  siteUrl: string;
  days: number;
}): Promise<{
  siteUrl: string;
  rows: RankingRow[];
  totals: { clicks: number; impressions: number; avgPosition: number; page1Count: number };
}> {
  const siteUrl = await resolveSiteUrl(input);
  const raw = await querySearchAnalytics(siteUrl, days, ["query", "page"]);

  const rows: RankingRow[] = raw.map((r) => ({
    query: r.keys?.[0] ?? "",
    page: r.keys?.[1] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));

  rows.sort((a, b) => b.impressions - a.impressions);

  const totals = {
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    avgPosition: rows.length ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0,
    page1Count: rows.filter((r) => r.position <= 10).length,
  };

  return { siteUrl, rows: rows.slice(0, 200), totals };
}

export type GscBucket = "striking" | "low-ctr" | "untapped" | "rising";
export type GscOpportunity = {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  bucket: GscBucket;
  reason: string;
};

// Rough CTR-by-position baseline (Advanced Web Ranking 2024 averages).
const CTR_BASELINE: Record<number, number> = {
  1: 0.279, 2: 0.157, 3: 0.11, 4: 0.077, 5: 0.054, 6: 0.04, 7: 0.031, 8: 0.024, 9: 0.019, 10: 0.016,
};

export async function mineOpportunities({
  siteUrl: input,
  days,
}: {
  siteUrl: string;
  days: number;
}): Promise<{ siteUrl: string; buckets: Record<GscBucket, GscOpportunity[]> }> {
  const siteUrl = await resolveSiteUrl(input);

  const current = await querySearchAnalytics(siteUrl, days, ["query", "page"]);
  const prior = await querySearchAnalytics(siteUrl, days * 2, ["query"]);

  // Build prior-period totals (subtract current from full-window to get "previous window")
  const currentByQuery = new Map<string, number>();
  for (const r of current) {
    const q = r.keys?.[0] ?? "";
    currentByQuery.set(q, (currentByQuery.get(q) || 0) + (r.impressions ?? 0));
  }
  const fullByQuery = new Map<string, number>();
  for (const r of prior) {
    const q = r.keys?.[0] ?? "";
    fullByQuery.set(q, (fullByQuery.get(q) || 0) + (r.impressions ?? 0));
  }
  const priorByQuery = new Map<string, number>();
  for (const [q, full] of fullByQuery) {
    const c = currentByQuery.get(q) || 0;
    priorByQuery.set(q, Math.max(0, full - c));
  }

  const all: GscOpportunity[] = current.map((r) => ({
    query: r.keys?.[0] ?? "",
    page: r.keys?.[1] ?? "",
    impressions: r.impressions ?? 0,
    clicks: r.clicks ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
    bucket: "untapped" as GscBucket,
    reason: "",
  }));

  const striking: GscOpportunity[] = [];
  const lowCtr: GscOpportunity[] = [];
  const untapped: GscOpportunity[] = [];
  const rising: GscOpportunity[] = [];

  for (const o of all) {
    if (o.position >= 11 && o.position <= 30 && o.impressions >= 5) {
      striking.push({ ...o, bucket: "striking", reason: `Ranks #${o.position.toFixed(1)} with ${o.impressions} impressions — small content boost could push to page 1.` });
    } else if (o.position >= 1 && o.position <= 10 && o.impressions >= 50) {
      const expected = CTR_BASELINE[Math.round(o.position)] ?? 0.02;
      if (o.ctr < expected * 0.6) {
        lowCtr.push({
          ...o,
          bucket: "low-ctr",
          reason: `CTR ${(o.ctr * 100).toFixed(1)}% vs ${(expected * 100).toFixed(1)}% expected at #${o.position.toFixed(1)} — title/meta rewrite candidate.`,
        });
      }
    } else if (o.clicks === 0 && o.impressions >= 10 && o.position > 30) {
      untapped.push({
        ...o,
        bucket: "untapped",
        reason: `${o.impressions} impressions, 0 clicks at #${o.position.toFixed(0)} — net-new content opportunity.`,
      });
    }

    const priorImpr = priorByQuery.get(o.query) ?? 0;
    if (o.impressions >= 20 && priorImpr > 0 && o.impressions >= priorImpr * 1.5) {
      rising.push({
        ...o,
        bucket: "rising",
        reason: `Impressions up from ${priorImpr} → ${o.impressions} vs prior window — capitalize on momentum.`,
      });
    }
  }

  // Sort each bucket by impressions desc, cap to 25 per bucket
  const cap = 25;
  return {
    siteUrl,
    buckets: {
      striking: striking.sort((a, b) => b.impressions - a.impressions).slice(0, cap),
      "low-ctr": lowCtr.sort((a, b) => b.impressions - a.impressions).slice(0, cap),
      untapped: untapped.sort((a, b) => b.impressions - a.impressions).slice(0, cap),
      rising: rising.sort((a, b) => b.impressions - a.impressions).slice(0, cap),
    },
  };
}
