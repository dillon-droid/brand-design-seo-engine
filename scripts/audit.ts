// Comprehensive end-to-end audit of every API endpoint.
// Hits the LOCAL dev API (not production) so we exercise the latest code.
import "dotenv/config";

const BASE = process.env.AUDIT_BASE || "http://localhost:3001";
const EMAIL = "dillon@branddesignco.com";
const PASSWORD = "YTcuxFksfixyaBuj";

type Result = { name: string; status: "PASS" | "FAIL" | "SKIP" | "WARN"; detail?: string; ms?: number };
const results: Result[] = [];
let cookie = "";

async function call(method: string, path: string, body?: unknown) {
  const start = Date.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const m = setCookie.match(/bd_session=([^;]+)/);
    if (m) cookie = `bd_session=${m[1]}`;
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json, raw: text, ms: Date.now() - start };
}

async function check(
  name: string,
  fn: () => Promise<Result | void>,
  opts: { allowFail?: boolean } = {},
) {
  process.stdout.write(`  ${name}…`);
  try {
    const r = (await fn()) || { name, status: "PASS" as const };
    results.push({ ...r, name });
    process.stdout.write(` ${r.status}${r.ms ? ` (${r.ms}ms)` : ""}\n`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const status = opts.allowFail ? ("WARN" as const) : ("FAIL" as const);
    results.push({ name, status, detail });
    process.stdout.write(` ${status}\n    └ ${detail}\n`);
  }
}

console.log(`\n=== AUDIT against ${BASE} ===\n`);

console.log("AUTH");
await check("login → 200 + session cookie", async () => {
  const r = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (!cookie) throw new Error("no session cookie returned");
  return { name: "", status: "PASS", ms: r.ms };
});
await check("auth/me with cookie", async () => {
  const r = await call("GET", "/api/auth/me");
  if (r.status !== 200 || !(r.body as { user: unknown })?.user) throw new Error(`status ${r.status}`);
  return { name: "", status: "PASS", ms: r.ms };
});
await check("login wrong password → 401", async () => {
  const tmp = cookie;
  cookie = "";
  const r = await call("POST", "/api/auth/login", { email: EMAIL, password: "wrong" });
  cookie = tmp;
  if (r.status !== 401) throw new Error(`expected 401 got ${r.status}`);
  return { name: "", status: "PASS", ms: r.ms };
});

console.log("\nCOMPANIES");
let testCompanyId = "";
await check("list companies", async () => {
  const r = await call("GET", "/api/companies");
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const list = r.body as Array<{ id: string }>;
  if (list.length === 0) return { name: "", status: "WARN", detail: "no companies — skipping company-scoped tests" };
  testCompanyId = list[0].id;
  return { name: "", status: "PASS", detail: `${list.length} companies`, ms: r.ms };
});
await check("create then delete a company", async () => {
  const created = await call("POST", "/api/companies", { name: "AUDIT TEST CO" });
  if (created.status !== 200) throw new Error(`create ${created.status}`);
  const id = (created.body as { id: string }).id;
  const updated = await call("PATCH", `/api/companies/${id}`, { industry: "Other" });
  if (updated.status !== 200) throw new Error(`patch ${updated.status}`);
  const deleted = await call("DELETE", `/api/companies/${id}`);
  if (deleted.status !== 204) throw new Error(`delete ${deleted.status}`);
  return { name: "", status: "PASS", ms: created.ms + updated.ms + deleted.ms };
});

console.log("\nKEYWORDS — AI");
await check("AI Suggest by industry", async () => {
  const r = await call("POST", "/api/keywords/suggest", { industry: "Roofing & Building Supply" });
  if (r.status !== 200) throw new Error(`status ${r.status} body ${r.raw.slice(0, 200)}`);
  const list = (r.body as { results: unknown[] }).results;
  if (!Array.isArray(list) || list.length < 5) throw new Error(`expected 5+ results got ${list?.length}`);
  return { name: "", status: "PASS", detail: `${list.length} keywords`, ms: r.ms };
});
await check("AI Deep research a seed keyword", async () => {
  const r = await call("POST", "/api/keywords/research", { seedKeyword: "roof replacement cost", industry: "Construction" });
  if (r.status !== 200) throw new Error(`status ${r.status} body ${r.raw.slice(0, 200)}`);
  const list = (r.body as { results: unknown[] }).results;
  if (!Array.isArray(list) || list.length < 5) throw new Error(`expected 5+ got ${list?.length}`);
  return { name: "", status: "PASS", detail: `${list.length} keywords`, ms: r.ms };
});
await check("AI Suggest secondaries for a keyword", async () => {
  const r = await call("POST", "/api/keywords/secondaries", { targetKeyword: "roof replacement cost" });
  if (r.status !== 200) throw new Error(`status ${r.status} body ${r.raw.slice(0, 200)}`);
  const list = (r.body as { results: unknown[] }).results;
  if (!Array.isArray(list) || list.length < 3) throw new Error(`expected 3+ got ${list?.length}`);
  return { name: "", status: "PASS", detail: `${list.length} secondaries`, ms: r.ms };
});
if (testCompanyId) {
  await check("Get Next Keywords for a company", async () => {
    const r = await call("POST", "/api/keywords/next", { companyId: testCompanyId });
    if (r.status !== 200) throw new Error(`status ${r.status} body ${r.raw.slice(0, 200)}`);
    const list = (r.body as { results: unknown[] }).results;
    if (!Array.isArray(list)) throw new Error("no results");
    return { name: "", status: "PASS", detail: `${list.length} suggestions`, ms: r.ms };
  });
}

console.log("\nKEYWORDS — Saved");
let testKeywordId = "";
await check("save a keyword", async () => {
  const r = await call("POST", "/api/keywords/saved", { keyword: "AUDIT TEST KW", companyId: testCompanyId, meta: { searchVolume: 100, difficulty: 50 } });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  testKeywordId = (r.body as { id: string }).id;
  return { name: "", status: "PASS", ms: r.ms };
});
await check("list saved keywords", async () => {
  const r = await call("GET", "/api/keywords/saved");
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  return { name: "", status: "PASS", detail: `${(r.body as unknown[]).length} saved`, ms: r.ms };
});
await check("toggle keyword targeted", async () => {
  if (!testKeywordId) return { name: "", status: "SKIP" };
  const r = await call("PATCH", `/api/keywords/saved/${testKeywordId}`, { targeted: true });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  return { name: "", status: "PASS", ms: r.ms };
});
await check("delete saved keyword", async () => {
  if (!testKeywordId) return { name: "", status: "SKIP" };
  const r = await call("DELETE", `/api/keywords/saved/${testKeywordId}`);
  if (r.status !== 204) throw new Error(`status ${r.status}`);
  return { name: "", status: "PASS", ms: r.ms };
});
await check("list keyword sessions", async () => {
  const r = await call("GET", "/api/keywords/sessions");
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  return { name: "", status: "PASS", detail: `${(r.body as unknown[]).length} sessions`, ms: r.ms };
});

console.log("\nGSC (requires Google connected)");
await check("google/status", async () => {
  const r = await call("GET", "/api/google/status");
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const s = r.body as { connected: boolean; configured: boolean };
  if (!s.configured) throw new Error("not configured (GOOGLE_OAUTH_CLIENT_ID missing)");
  return { name: "", status: s.connected ? "PASS" : "WARN", detail: s.connected ? "connected" : "not connected", ms: r.ms };
});
const status = await call("GET", "/api/google/status");
const googleConnected = (status.body as { connected: boolean }).connected;
if (googleConnected) {
  await check("list GSC sites", async () => {
    const r = await call("GET", "/api/google/sites");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const sites = (r.body as { sites: unknown[] }).sites;
    return { name: "", status: "PASS", detail: `${sites.length} sites`, ms: r.ms };
  });
  await check("fetch rankings for branddesignco.com", async () => {
    const r = await call("POST", "/api/rankings/fetch", { siteUrl: "branddesignco.com", days: 28 });
    if (r.status !== 200) throw new Error(`status ${r.status} body ${r.raw.slice(0, 200)}`);
    const out = r.body as { rows: unknown[]; totals: unknown };
    if (!Array.isArray(out.rows) || !out.totals) throw new Error("malformed");
    return { name: "", status: "PASS", detail: `${out.rows.length} rows`, ms: r.ms };
  });
  await check("GSC opportunity mine for branddesignco.com", async () => {
    const r = await call("POST", "/api/keywords/gsc-opportunities", { siteUrl: "branddesignco.com", days: 90 });
    if (r.status !== 200) throw new Error(`status ${r.status} body ${r.raw.slice(0, 200)}`);
    const buckets = (r.body as { buckets: Record<string, unknown[]> }).buckets;
    const total = Object.values(buckets).reduce((s, b) => s + (b as unknown[]).length, 0);
    return { name: "", status: "PASS", detail: `${total} opportunities`, ms: r.ms };
  });
}

console.log("\nARTICLES");
await check("list articles", async () => {
  const r = await call("GET", "/api/articles");
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  return { name: "", status: "PASS", detail: `${(r.body as unknown[]).length} articles`, ms: r.ms };
});
if (testCompanyId) {
  await check("list articles for a company", async () => {
    const r = await call("GET", `/api/articles?companyId=${testCompanyId}`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return { name: "", status: "PASS", detail: `${(r.body as unknown[]).length} for company`, ms: r.ms };
  });
}

console.log("\nDASHBOARD");
await check("dashboard stats", async () => {
  const r = await call("GET", "/api/dashboard");
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const d = r.body as { articlesGenerated: number; recentArticles: unknown[] };
  if (typeof d.articlesGenerated !== "number") throw new Error("no count");
  return { name: "", status: "PASS", ms: r.ms };
});

console.log("\n=== SUMMARY ===");
const groups = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
for (const r of results) groups[r.status]++;
console.log(`  ${groups.PASS} pass · ${groups.WARN} warn · ${groups.FAIL} fail · ${groups.SKIP} skip\n`);
const fails = results.filter((r) => r.status === "FAIL");
if (fails.length > 0) {
  console.log("FAILURES:");
  for (const f of fails) console.log(`  ❌ ${f.name}: ${f.detail}`);
}
const warns = results.filter((r) => r.status === "WARN");
if (warns.length > 0) {
  console.log("WARNINGS:");
  for (const w of warns) console.log(`  ⚠ ${w.name}: ${w.detail}`);
}
process.exit(fails.length > 0 ? 1 : 0);
