import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Bookmark, Building2, ChartColumn, ChevronDown, ChevronRight,
  ExternalLink, FileText, Pencil, RefreshCw, Sparkles, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CompanyForm, type CompanyFormData } from "@/components/CompanyForm";
import { GoogleConnect } from "@/components/GoogleConnect";
import { PageSpeedBadge } from "@/components/PageSpeedBadge";
import { Ga4Widget } from "@/components/Ga4Widget";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { formatNumber } from "@/lib/utils";

type RankingRow = {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
};
type RankingResponse = {
  siteUrl: string;
  rows: RankingRow[];
  totals: { clicks: number; impressions: number; avgPosition: number; page1Count: number };
};
type GoogleStatus = { connected: boolean; configured: boolean };

type Company = CompanyFormData & { id: string; createdAt: string; updatedAt: string; ga4PropertyId?: string | null };
type SavedKeyword = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
  competition: string | null;
  rationale: string | null;
  targeted: boolean;
  companyId: string | null;
  createdAt: string;
};
type Article = {
  id: string;
  title: string;
  targetKeyword: string;
  metaDescription: string;
  seoScore: number;
  wordCount: number;
  companyId: string | null;
  createdAt: string;
};
type NextKeyword = {
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  cpc?: number;
  rationale?: string;
};

export function CompanyDetailPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [showBrandScript, setShowBrandScript] = useState(false);
  const [nextResults, setNextResults] = useState<NextKeyword[] | null>(null);

  const { data: company, isLoading } = useQuery<Company>({
    queryKey: ["company", id],
    queryFn: async () => {
      const all = await api.get<Company[]>(`/api/companies`);
      const found = all.find((c) => c.id === id);
      if (!found) throw new Error("Company not found");
      return found;
    },
  });

  const { data: savedKeywords = [] } = useQuery<SavedKeyword[]>({
    queryKey: ["saved-keywords", id],
    queryFn: () => api.get<SavedKeyword[]>(`/api/keywords/saved?companyId=${id}`),
  });

  const { data: articles = [] } = useQuery<Article[]>({
    queryKey: ["articles", id],
    queryFn: () => api.get<Article[]>(`/api/articles?companyId=${id}`),
  });

  const update = useMutation({
    mutationFn: (body: CompanyFormData & { id: string }) =>
      api.patch<Company>(`/api/companies/${body.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", id] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      setEditing(false);
      toast({ title: "Company updated" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggleTargeted = useMutation({
    mutationFn: (k: SavedKeyword) =>
      api.patch<SavedKeyword>(`/api/keywords/saved/${k.id}`, { targeted: !k.targeted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-keywords", id] }),
  });

  const getNext = useMutation({
    mutationFn: () =>
      api.post<{ results: NextKeyword[] }>("/api/keywords/next", { companyId: id }),
    onSuccess: (r) => setNextResults(r.results),
    onError: (e: Error) => toast({ title: "Next-keyword recommendation failed", description: e.message, variant: "destructive" }),
  });

  const saveKeyword = useMutation({
    mutationFn: (body: { keyword: string; meta?: Partial<NextKeyword> }) =>
      api.post<SavedKeyword>("/api/keywords/saved", { keyword: body.keyword, companyId: id, meta: body.meta }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-keywords", id] });
      toast({ title: "Keyword saved" });
    },
  });

  const { data: googleStatus } = useQuery<GoogleStatus>({
    queryKey: ["google-status"],
    queryFn: () => api.get("/api/google/status"),
  });

  const [rankings, setRankings] = useState<RankingResponse | null>(null);
  const [rankingDays, setRankingDays] = useState<number>(28);

  const fetchRankings = useMutation({
    mutationFn: (body: { siteUrl: string; days: number }) =>
      api.post<RankingResponse>("/api/rankings/fetch", body),
    onSuccess: (r) => setRankings(r),
    onError: (e: Error) => toast({ title: "Couldn't fetch rankings", description: e.message, variant: "destructive" }),
  });

  // Auto-fetch rankings when company + Google connected
  const company_domain = company?.domain;
  useEffect(() => {
    if (!company_domain || !googleStatus?.connected) return;
    if (rankings) return; // only initial fetch — user can refresh manually
    fetchRankings.mutate({ siteUrl: company_domain, days: rankingDays });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_domain, googleStatus?.connected]);

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-secondary rounded w-32" />
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-secondary rounded-xl" />
            <div className="space-y-2 flex-1">
              <div className="h-7 bg-secondary rounded w-1/3" />
              <div className="h-3 bg-secondary rounded w-1/4" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-6">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 bg-secondary rounded-xl" />)}
          </div>
          <div className="h-32 bg-secondary rounded-xl" />
          <div className="h-64 bg-secondary rounded-xl" />
        </div>
      </div>
    );
  }
  if (!company) return <div className="p-10 text-muted-foreground">Company not found.</div>;

  const targeted = savedKeywords.filter((k) => k.targeted);
  const notTargeted = savedKeywords.filter((k) => !k.targeted);

  // Map keyword (lowercase) → article id, so we can show "Article exists" badges
  const articleByKeyword = new Map<string, string>();
  for (const a of articles) {
    if (a.targetKeyword) articleByKeyword.set(a.targetKeyword.toLowerCase(), a.id);
  }

  const goToArticle = (keyword: string) => {
    const params = new URLSearchParams({ keyword, companyId: id });
    navigate(`/articles?${params.toString()}`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link href="/companies" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to Companies
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center shrink-0">
            <Building2 className="w-7 h-7 text-[hsl(36_95%_57%)]" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold font-display text-foreground">{company.name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              {company.industry && <span>{company.industry}</span>}
              {company.location && <span>· {company.location}</span>}
              {company.domain && (
                <a href={`https://${company.domain.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="text-[hsl(36_95%_57%)] hover:underline">
                  · {company.domain}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
          <Button onClick={() => navigate(`/articles?companyId=${id}`)}>
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Generate Article
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Articles" value={String(articles.length)} icon={FileText} />
        <Stat label="Targeting" value={String(targeted.length)} icon={Target} />
        <Stat label="Saved KWs" value={String(savedKeywords.length)} icon={Bookmark} />
        <Stat label="Total Words" value={formatNumber(articles.reduce((s, a) => s + a.wordCount, 0))} icon={Sparkles} />
      </div>

      {/* StoryBrand collapsible */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <button
            type="button"
            onClick={() => setShowBrandScript((s) => !s)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showBrandScript ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span className="text-sm font-bold uppercase tracking-wide text-[hsl(36_95%_57%)]">StoryBrand</span>
            <span className="text-[11px] text-[hsl(0_0%_45%)] ml-auto">
              {company.brandScript || company.sbHero ? "Loaded" : "Not yet — add for better article quality"}
            </span>
          </button>
          {showBrandScript && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {sbField("Hero (Customer)", company.sbHero)}
              {sbField("External Problem", company.sbExternalProblem)}
              {sbField("Internal Problem", company.sbInternalProblem)}
              {sbField("Guide Positioning", company.sbGuide)}
              {sbField("Plan", company.sbPlan)}
              {sbField("CTA", company.sbCta)}
              {sbField("Success Vision", company.sbSuccessVision)}
              {sbField("Failure Stakes", company.sbFailureStakes)}
              {sbField("Brand Voice", company.sbBrandVoice)}
              {company.brandScript && (
                <div className="md:col-span-2 mt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)] mb-1.5">Full BrandScript</div>
                  <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono bg-secondary p-3 rounded">{company.brandScript}</pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GA4 widget */}
      {company.domain && googleStatus?.connected && (
        <div className="mb-6">
          <Ga4Widget
            companyId={id}
            domain={company.domain}
            propertyId={company.ga4PropertyId ?? null}
            googleConnected={!!googleStatus?.connected}
          />
        </div>
      )}

      {/* Rankings (auto-fetched if domain set + Google connected) */}
      {company.domain && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="flex items-center gap-2">
                <ChartColumn className="w-4 h-4 text-[hsl(36_95%_57%)]" />
                <h2 className="text-sm font-bold uppercase tracking-wide">
                  Live Rankings ({company.domain})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={rankingDays}
                  onChange={(e) => {
                    const d = Number(e.target.value);
                    setRankingDays(d);
                    if (company.domain) fetchRankings.mutate({ siteUrl: company.domain, days: d });
                  }}
                  className="text-xs bg-input border border-border rounded px-2 py-1 text-foreground"
                >
                  <option value={7}>7 days</option>
                  <option value={28}>28 days</option>
                  <option value={90}>90 days</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fetchRankings.mutate({ siteUrl: company.domain, days: rankingDays })}
                  disabled={fetchRankings.isPending || !googleStatus?.connected}
                  title="Refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchRankings.isPending ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {!googleStatus?.connected ? (
              <GoogleConnect />
            ) : fetchRankings.isPending && !rankings ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Loading rankings…</div>
            ) : !rankings ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Click refresh to fetch rankings for {company.domain}.
              </div>
            ) : rankings.rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No GSC data for {company.domain} in the last {rankingDays} days. Make sure you have access to its Search Console property.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <MiniStat label="Clicks" value={formatNumber(rankings.totals.clicks)} />
                  <MiniStat label="Impressions" value={formatNumber(rankings.totals.impressions)} />
                  <MiniStat label="Avg Position" value={rankings.totals.avgPosition.toFixed(1)} />
                  <MiniStat label="Page 1 KWs" value={String(rankings.totals.page1Count)} />
                </div>
                <div className="divide-y divide-border max-h-96 overflow-y-auto">
                  {rankings.rows.slice(0, 30).map((r, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground truncate">{r.query}</div>
                        <div className="flex items-center gap-2">
                          <a
                            href={r.page}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-[hsl(0_0%_45%)] hover:text-[hsl(36_95%_57%)] flex items-center gap-1 truncate"
                          >
                            {r.page} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <PageSpeedBadge url={r.page} />
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-3 text-[hsl(0_0%_55%)] shrink-0">
                        <span>Impr {formatNumber(r.impressions)}</span>
                        <span>Clk {r.clicks}</span>
                        <span>CTR {(r.ctr * 100).toFixed(1)}%</span>
                      </div>
                      <Badge variant={r.position <= 10 ? "success" : r.position <= 30 ? "default" : "secondary"}>
                        #{r.position.toFixed(1)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => goToArticle(r.query)}
                        title="Generate article for this query"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                {rankings.rows.length > 30 && (
                  <p className="text-[11px] text-[hsl(0_0%_45%)] text-center mt-3">
                    Showing top 30 of {rankings.rows.length} queries
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Articles */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(0_0%_55%)]">Articles ({articles.length})</h2>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/articles?companyId=${id}`)}>
                + New
              </Button>
            </div>
            {articles.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No articles yet for {company.name}.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {articles.map((a) => (
                  <Link key={a.id} href={`/articles/${a.id}`} className="block py-3 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-[hsl(36_95%_57%)]">
                          {a.title}
                        </div>
                        <div className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5">Target: {a.targetKeyword}</div>
                      </div>
                      <Badge variant={a.seoScore >= 80 ? "success" : a.seoScore >= 60 ? "default" : "warning"}>
                        SEO {a.seoScore}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Targeted keywords */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-3">
              Targeting ({targeted.length})
            </h2>
            {targeted.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No keywords being targeted yet. Click the target icon on a saved keyword to mark it.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {targeted.map((k) => (
                  <KeywordRow
                    key={k.id}
                    k={k}
                    onToggleTarget={() => toggleTargeted.mutate(k)}
                    onArticle={() => goToArticle(k.keyword)}
                    existingArticleId={articleByKeyword.get(k.keyword.toLowerCase())}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Saved (not targeted) */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-3">
              Saved Keywords — Not Yet Targeting ({notTargeted.length})
            </h2>
            {notTargeted.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No untargeted keywords. Use Keyword Research to find more.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notTargeted.map((k) => (
                  <KeywordRow key={k.id} k={k} onToggleTarget={() => toggleTargeted.mutate(k)} onArticle={() => goToArticle(k.keyword)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next keyword recommendations */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(36_95%_57%)]">What to target next</h2>
              <Button size="sm" onClick={() => getNext.mutate()} disabled={getNext.isPending}>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {getNext.isPending ? "Thinking…" : "Get Next Keywords"}
              </Button>
            </div>
            {nextResults === null ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Click "Get Next Keywords" — we'll suggest fresh keywords based on {company.name}'s industry, BrandScript, and what you've already saved.
              </p>
            ) : nextResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No new ideas right now. Try keyword research.</p>
            ) : (
              <div className="divide-y divide-border">
                {nextResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{r.keyword}</div>
                      {r.rationale && <div className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5">{r.rationale}</div>}
                    </div>
                    <div className="hidden md:flex items-center gap-3 text-[11px] text-[hsl(0_0%_55%)]">
                      {r.searchVolume != null && <span>Vol {formatNumber(r.searchVolume)}</span>}
                      {r.difficulty != null && <span>KD {r.difficulty}</span>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => saveKeyword.mutate({ keyword: r.keyword, meta: r })} title="Save">
                      <Bookmark className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => goToArticle(r.keyword)}>
                      <FileText className="w-3 h-3 mr-1" /> Article
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
          </DialogHeader>
          <CompanyForm
            initial={company}
            onSubmit={(d) => update.mutate({ ...d, id: company.id })}
            submitting={update.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary border border-border rounded p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">{label}</div>
      <div className="text-base font-extrabold font-display text-foreground">{value}</div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FileText }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[hsl(36_95%_57%)]" />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">{label}</div>
          <div className="text-xl font-extrabold font-display text-foreground">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function KeywordRow({
  k,
  onToggleTarget,
  onArticle,
  existingArticleId,
}: {
  k: SavedKeyword;
  onToggleTarget: () => void;
  onArticle: () => void;
  existingArticleId?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <button type="button" onClick={onToggleTarget} className="shrink-0" aria-label={k.targeted ? "Mark not targeted" : "Mark targeted"}>
        <Target className={`w-4 h-4 ${k.targeted ? "text-[hsl(36_95%_57%)]" : "text-[hsl(0_0%_30%)]"}`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
          {k.keyword}
          {existingArticleId && (
            <Badge variant="success" className="shrink-0 text-[9px]">
              <FileText className="w-2.5 h-2.5 mr-0.5" /> Article
            </Badge>
          )}
        </div>
        {k.rationale && <div className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5 line-clamp-1">{k.rationale}</div>}
      </div>
      <div className="hidden md:flex items-center gap-3 text-[11px] text-[hsl(0_0%_55%)]">
        {k.searchVolume != null && <span>Vol {formatNumber(k.searchVolume)}</span>}
        {k.difficulty != null && <span>KD {k.difficulty}</span>}
      </div>
      {existingArticleId ? (
        <Link href={`/articles/${existingArticleId}`}>
          <Button size="sm" variant="outline" asChild={false}>
            <FileText className="w-3 h-3 mr-1" /> View
          </Button>
        </Link>
      ) : (
        <Button size="sm" variant="outline" onClick={onArticle}>
          <FileText className="w-3 h-3 mr-1" /> Article
        </Button>
      )}
    </div>
  );
}

function sbField(label: string, value?: string) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)] mb-1">{label}</div>
      <div className="text-foreground/85">{value}</div>
    </div>
  );
}

// Tiny icon import for ArrowRight not used directly; satisfy linter
void ArrowRight;
