// Google Analytics 4 Data API. Uses the user's OAuth token (analytics.readonly
// scope, which we already request). Each company can have a ga4PropertyId set;
// at first visit we try to auto-detect by domain match against the user's
// accessible properties.
import { google, type Auth } from "googleapis";

type OAuth2Client = Auth.OAuth2Client;

export type GaProperty = {
  propertyId: string;
  displayName: string;
  websiteUrl: string | null;
  accountName: string | null;
};

/** List all GA4 properties this user has access to. */
export async function listProperties(auth: OAuth2Client): Promise<GaProperty[]> {
  const admin = google.analyticsadmin({ version: "v1beta", auth });
  const props: GaProperty[] = [];

  // First list accounts, then list properties under each.
  const { data: accountsData } = await admin.accountSummaries.list({ pageSize: 200 });
  for (const summary of accountsData.accountSummaries ?? []) {
    for (const propSummary of summary.propertySummaries ?? []) {
      const propertyName = propSummary.property; // "properties/12345"
      if (!propertyName) continue;
      let websiteUrl: string | null = null;
      try {
        const { data: streams } = await admin.properties.dataStreams.list({ parent: propertyName });
        const web = streams.dataStreams?.find((s) => s.type === "WEB_DATA_STREAM");
        websiteUrl = web?.webStreamData?.defaultUri ?? null;
      } catch {}
      props.push({
        propertyId: propertyName.replace("properties/", ""),
        displayName: propSummary.displayName ?? propertyName,
        websiteUrl,
        accountName: summary.displayName ?? null,
      });
    }
  }
  return props;
}

/** Match a domain (e.g. "branddesignco.com") against this user's properties. */
export async function findPropertyForDomain(auth: OAuth2Client, domain: string): Promise<GaProperty | null> {
  if (!domain) return null;
  const norm = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
  const props = await listProperties(auth);
  return (
    props.find((p) => p.websiteUrl?.toLowerCase().includes(norm)) ??
    props.find((p) => p.displayName.toLowerCase().includes(norm)) ??
    null
  );
}

export type GaOverview = {
  propertyId: string;
  range: { startDate: string; endDate: string };
  totals: {
    sessions: number;
    activeUsers: number;
    newUsers: number;
    screenPageViews: number;
    averageSessionDuration: number; // seconds
    bounceRate: number; // 0–1
    conversions: number;
  };
  bySource: Array<{ source: string; medium: string; sessions: number; users: number }>;
  byPage: Array<{ pagePath: string; pageTitle: string; sessions: number; users: number; views: number }>;
};

function dateRange(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

/** Pull a per-property overview for the last N days. */
export async function fetchPropertyOverview({
  auth,
  propertyId,
  days,
}: {
  auth: OAuth2Client;
  propertyId: string;
  days: number;
}): Promise<GaOverview> {
  const data = google.analyticsdata({ version: "v1beta", auth });
  const { startDate, endDate } = dateRange(days);
  const property = `properties/${propertyId}`;

  const [totalsResp, sourceResp, pageResp] = await Promise.all([
    data.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
          { name: "conversions" },
        ],
      },
    }),
    data.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "10",
      },
    }),
    data.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "20",
      },
    }),
  ]);

  const tRow = totalsResp.data.rows?.[0]?.metricValues ?? [];
  const num = (i: number) => Number(tRow[i]?.value ?? 0);
  return {
    propertyId,
    range: { startDate, endDate },
    totals: {
      sessions: num(0),
      activeUsers: num(1),
      newUsers: num(2),
      screenPageViews: num(3),
      averageSessionDuration: num(4),
      bounceRate: num(5),
      conversions: num(6),
    },
    bySource: (sourceResp.data.rows ?? []).map((r) => ({
      source: r.dimensionValues?.[0]?.value ?? "",
      medium: r.dimensionValues?.[1]?.value ?? "",
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
      users: Number(r.metricValues?.[1]?.value ?? 0),
    })),
    byPage: (pageResp.data.rows ?? []).map((r) => ({
      pagePath: r.dimensionValues?.[0]?.value ?? "",
      pageTitle: r.dimensionValues?.[1]?.value ?? "",
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
      users: Number(r.metricValues?.[1]?.value ?? 0),
      views: Number(r.metricValues?.[2]?.value ?? 0),
    })),
  };
}

/** Per-page traffic for an article's published URL. */
export async function fetchPagePerformance({
  auth,
  propertyId,
  pagePath,
  days,
}: {
  auth: OAuth2Client;
  propertyId: string;
  pagePath: string; // e.g. "/blog/asphalt-shingles-wholesale"
  days: number;
}): Promise<{
  sessions: number;
  users: number;
  views: number;
  conversions: number;
  averageSessionDuration: number;
}> {
  const data = google.analyticsdata({ version: "v1beta", auth });
  const { startDate, endDate } = dateRange(days);
  const { data: r } = await data.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: { fieldName: "pagePath", stringFilter: { matchType: "EXACT", value: pagePath } },
      },
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "conversions" },
        { name: "averageSessionDuration" },
      ],
    },
  });
  const m = r.rows?.[0]?.metricValues ?? [];
  return {
    sessions: Number(m[0]?.value ?? 0),
    users: Number(m[1]?.value ?? 0),
    views: Number(m[2]?.value ?? 0),
    conversions: Number(m[3]?.value ?? 0),
    averageSessionDuration: Number(m[4]?.value ?? 0),
  };
}
