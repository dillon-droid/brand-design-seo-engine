import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChartColumn, ExternalLink, Lightbulb, Search, Sparkles, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { INDUSTRIES } from "@/components/CompanyForm";
import { formatNumber } from "@/lib/utils";

type KeywordResult = {
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  cpc?: number;
  competition?: string;
  intent?: string;
  rationale?: string;
};

type Company = { id: string; name: string; domain: string; industry: string };

type SavedKeyword = KeywordResult & {
  id: string;
  companyId: string | null;
  targeted: boolean;
  createdAt: string;
};

type GscBucket = "striking" | "low-ctr" | "untapped" | "rising";
type GscOpportunity = {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  bucket: GscBucket;
  reason: string;
};

const bucketLabel: Record<GscBucket, string> = {
  striking: "Striking distance (pos 11–30)",
  "low-ctr": "Low-CTR underperformer",
  untapped: "Untapped long-tail",
  rising: "Rising query",
};

const bucketVariant: Record<GscBucket, "default" | "warning" | "purple" | "success"> = {
  striking: "default",
  "low-ctr": "warning",
  untapped: "purple",
  rising: "success",
};

export function KeywordsPage() {
  const qc = useQueryClient();

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get<Company[]>("/api/companies"),
  });

  const [companyId, setCompanyId] = useState<string>("");
  const [filter, setFilter] = useState("");

  const { data: saved = [] } = useQuery<SavedKeyword[]>({
    queryKey: ["saved-keywords", companyId],
    queryFn: () => api.get<SavedKeyword[]>(`/api/keywords/saved${companyId ? `?companyId=${companyId}` : ""}`),
  });

  const filteredSaved = useMemo(
    () => saved.filter((s) => s.keyword.toLowerCase().includes(filter.toLowerCase())),
    [saved, filter],
  );

  const saveKeyword = useMutation({
    mutationFn: (body: { keyword: string; companyId?: string; meta?: Partial<KeywordResult> }) =>
      api.post<SavedKeyword>("/api/keywords/saved", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-keywords"] });
      toast({ title: "Keyword saved" });
    },
  });

  const toggleTargeted = useMutation({
    mutationFn: (k: SavedKeyword) =>
      api.patch<SavedKeyword>(`/api/keywords/saved/${k.id}`, { targeted: !k.targeted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-keywords"] }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold font-display text-foreground mb-1">Keyword Research</h1>
        <p className="text-sm text-muted-foreground">
          Discover keywords to target — start with suggestions or go deep on a specific keyword.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 flex items-center gap-3">
          <Label className="mb-0">Company</Label>
          <Select value={companyId || "none"} onValueChange={(v) => setCompanyId(v === "none" ? "" : v)}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="(no company)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(no company)</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="suggest">
        <TabsList>
          <TabsTrigger value="suggest"><Sparkles className="w-3.5 h-3.5 mr-1.5" />AI Suggest</TabsTrigger>
          <TabsTrigger value="research"><Search className="w-3.5 h-3.5 mr-1.5" />Deep Research</TabsTrigger>
          <TabsTrigger value="gsc"><ChartColumn className="w-3.5 h-3.5 mr-1.5" />GSC Opportunities</TabsTrigger>
          <TabsTrigger value="saved"><Bookmark className="w-3.5 h-3.5 mr-1.5" />Saved ({saved.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="suggest">
          <SuggestPanel companyId={companyId} onSave={saveKeyword.mutate} />
        </TabsContent>

        <TabsContent value="research">
          <ResearchPanel companyId={companyId} onSave={saveKeyword.mutate} />
        </TabsContent>

        <TabsContent value="gsc">
          <GscOpportunityPanel
            companies={companies}
            companyId={companyId}
            onSave={(o) =>
              saveKeyword.mutate({
                keyword: o.query,
                companyId: companyId || undefined,
                meta: { rationale: `${bucketLabel[o.bucket]} — ${o.reason}` },
              })
            }
          />
        </TabsContent>

        <TabsContent value="saved">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Input
                  placeholder="Filter by keyword…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              {filteredSaved.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-12">
                  No saved keywords yet. Use Suggest, Research, or GSC Opportunities to find and bookmark keywords.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredSaved.map((k) => (
                    <div key={k.id} className="flex items-center gap-4 py-3">
                      <Target
                        className={`w-4 h-4 cursor-pointer ${k.targeted ? "text-[hsl(36_95%_57%)]" : "text-[hsl(0_0%_30%)]"}`}
                        onClick={() => toggleTargeted.mutate(k)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{k.keyword}</div>
                        {k.rationale ? (
                          <div className="text-[11px] text-[hsl(0_0%_45%)] mt-0.5">{k.rationale}</div>
                        ) : null}
                      </div>
                      <KeywordMeta k={k} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KeywordMeta({ k }: { k: KeywordResult }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-[hsl(0_0%_55%)] shrink-0">
      {k.searchVolume != null ? <span>Vol {formatNumber(k.searchVolume)}</span> : null}
      {k.difficulty != null ? <span>KD {k.difficulty}</span> : null}
      {k.cpc != null ? <span>${k.cpc.toFixed(2)}</span> : null}
    </div>
  );
}

function SuggestPanel({
  companyId,
  onSave,
}: {
  companyId: string;
  onSave: (b: { keyword: string; companyId?: string; meta?: Partial<KeywordResult> }) => void;
}) {
  const [industry, setIndustry] = useState("");
  const [results, setResults] = useState<KeywordResult[]>([]);

  const run = useMutation({
    mutationFn: () =>
      api.post<{ results: KeywordResult[] }>("/api/keywords/suggest", { industry, companyId: companyId || undefined }),
    onSuccess: (r) => setResults(r.results),
    onError: (e: Error) => toast({ title: "Suggestion failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1">
            <Label>Industry</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger><SelectValue placeholder="Select industry…" /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => run.mutate()} disabled={!industry || run.isPending}>
            {run.isPending ? "Generating…" : "Suggest Keywords"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Enter an industry to get keyword suggestions. Add a company name and location for more targeted results.
        </p>

        <ResultList results={results} onSave={(r) => onSave({ keyword: r.keyword, companyId: companyId || undefined, meta: r })} />
      </CardContent>
    </Card>
  );
}

function ResearchPanel({
  companyId,
  onSave,
}: {
  companyId: string;
  onSave: (b: { keyword: string; companyId?: string; meta?: Partial<KeywordResult> }) => void;
}) {
  const [seed, setSeed] = useState("");
  const [industry, setIndustry] = useState("");
  const [results, setResults] = useState<KeywordResult[]>([]);

  const run = useMutation({
    mutationFn: () =>
      api.post<{ results: KeywordResult[] }>("/api/keywords/research", {
        seedKeyword: seed,
        industry,
        companyId: companyId || undefined,
      }),
    onSuccess: (r) => setResults(r.results),
    onError: (e: Error) => toast({ title: "Research failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 items-end">
          <div className="md:col-span-2">
            <Label>Seed Keyword</Label>
            <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. roof replacement cost" />
          </div>
          <Button onClick={() => run.mutate()} disabled={!seed || run.isPending}>
            {run.isPending ? "Researching…" : "Research Keywords"}
          </Button>
        </div>
        <div className="mb-4">
          <Label>Industry (optional)</Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Industry…" /></SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Enter a seed keyword and industry to find related opportunities, long-tail variations, and questions people ask.
        </p>
        <ResultList results={results} onSave={(r) => onSave({ keyword: r.keyword, companyId: companyId || undefined, meta: r })} />
      </CardContent>
    </Card>
  );
}

function GscOpportunityPanel({
  companies,
  companyId,
  onSave,
}: {
  companies: Company[];
  companyId: string;
  onSave: (o: GscOpportunity) => void;
}) {
  const company = companies.find((c) => c.id === companyId);
  const [siteUrl, setSiteUrl] = useState(company?.domain || "");
  const [days, setDays] = useState("90");
  const [results, setResults] = useState<{ buckets: Record<GscBucket, GscOpportunity[]> } | null>(null);

  const run = useMutation({
    mutationFn: () =>
      api.post<{ buckets: Record<GscBucket, GscOpportunity[]> }>(
        "/api/keywords/gsc-opportunities",
        { siteUrl, days: Number(days), companyId: companyId || undefined },
      ),
    onSuccess: (r) => setResults(r),
    onError: (e: Error) => toast({ title: "Failed to fetch GSC", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 items-end">
          <div className="md:col-span-2">
            <Label>GSC Site URL</Label>
            <Input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="branddesignco.com or sc-domain:branddesignco.com"
            />
          </div>
          <div>
            <Label>Window</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="28">Last 28 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 180 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => run.mutate()} disabled={!siteUrl || run.isPending}>
          {run.isPending ? "Mining…" : "Mine GSC Opportunities"}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 mb-5">
          Pulls real queries from Search Console and groups them into striking-distance, low-CTR, untapped, and rising buckets.
          Make sure the service account is granted access to this site as a Restricted user.
        </p>

        {results ? (
          <div className="space-y-6">
            {(["striking", "low-ctr", "untapped", "rising"] as GscBucket[]).map((b) => (
              <div key={b}>
                <div className="flex items-center gap-2 mb-2">
                  {b === "striking" ? <Target className="w-4 h-4 text-[hsl(36_95%_57%)]" /> :
                   b === "low-ctr" ? <Lightbulb className="w-4 h-4 text-yellow-400" /> :
                   b === "untapped" ? <Sparkles className="w-4 h-4 text-purple-400" /> :
                   <TrendingUp className="w-4 h-4 text-green-400" />}
                  <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                    {bucketLabel[b]}
                  </h3>
                  <Badge variant={bucketVariant[b]}>{results.buckets[b]?.length || 0}</Badge>
                </div>
                {results.buckets[b]?.length ? (
                  <div className="divide-y divide-border border border-border rounded-md">
                    {results.buckets[b].map((o, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{o.query}</div>
                          <a
                            href={o.page}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-[hsl(0_0%_45%)] hover:text-[hsl(36_95%_57%)] flex items-center gap-1 truncate mt-0.5"
                          >
                            {o.page} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <div className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5">{o.reason}</div>
                        </div>
                        <div className="hidden md:flex items-center gap-4 text-[11px] text-[hsl(0_0%_55%)] shrink-0">
                          <span>Pos {o.position.toFixed(1)}</span>
                          <span>Impr {formatNumber(o.impressions)}</span>
                          <span>Clicks {o.clicks}</span>
                          <span>CTR {(o.ctr * 100).toFixed(1)}%</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onSave(o)}>
                          Save
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-3">No queries in this bucket.</div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResultList({
  results,
  onSave,
}: {
  results: KeywordResult[];
  onSave: (r: KeywordResult) => void;
}) {
  if (results.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">Start researching to see results.</div>;
  }
  return (
    <div className="divide-y divide-border border border-border rounded-md">
      {results.map((r, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{r.keyword}</div>
            {r.rationale ? <div className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5">{r.rationale}</div> : null}
          </div>
          <KeywordMeta k={r} />
          <Button size="sm" variant="outline" onClick={() => onSave(r)}>
            <Bookmark className="w-3 h-3 mr-1" />Save
          </Button>
        </div>
      ))}
    </div>
  );
}
