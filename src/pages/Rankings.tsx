import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChartColumn, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { formatNumber } from "@/lib/utils";

type Row = {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

type Response = {
  siteUrl: string;
  rows: Row[];
  totals: { clicks: number; impressions: number; avgPosition: number; page1Count: number };
};

export function RankingsPage() {
  const [siteUrl, setSiteUrl] = useState("");
  const [days, setDays] = useState("28");
  const [data, setData] = useState<Response | null>(null);

  const run = useMutation({
    mutationFn: () =>
      api.post<Response>("/api/rankings/fetch", { siteUrl, days: Number(days) }),
    onSuccess: (r) => setData(r),
    onError: (e: Error) => toast({ title: "Failed to fetch rankings", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold font-display text-foreground mb-1">Site Rankings</h1>
        <p className="text-sm text-muted-foreground">Pull live keyword rankings from Google Search Console.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <Label>GSC Site URL</Label>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="branddesignco.com or sc-domain:branddesignco.com"
              />
            </div>
            <div>
              <Label>Date Range</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="28">Last 28 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => run.mutate()} disabled={!siteUrl || run.isPending}>
              {run.isPending ? "Fetching…" : "Check Rankings"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Just type your domain — we'll find the right Search Console property automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      {data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Total Clicks" value={formatNumber(data.totals.clicks)} />
            <Stat label="Impressions" value={formatNumber(data.totals.impressions)} />
            <Stat label="Avg Position" value={data.totals.avgPosition.toFixed(1)} />
            <Stat label="Page 1 Keywords" value={String(data.totals.page1Count)} />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <ChartColumn className="w-4 h-4 text-[hsl(36_95%_57%)]" />
                <h2 className="text-sm font-bold uppercase tracking-wide">Keyword Rankings — {data.siteUrl}</h2>
              </div>
              <div className="divide-y divide-border">
                {data.rows.map((r, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{r.query}</div>
                      <a
                        href={r.page}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[hsl(0_0%_45%)] hover:text-[hsl(36_95%_57%)] flex items-center gap-1 truncate mt-0.5"
                      >
                        {r.page} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="hidden md:flex items-center gap-6 text-xs text-[hsl(0_0%_60%)] shrink-0">
                      <span>Impr {formatNumber(r.impressions)}</span>
                      <span>Clicks {r.clicks}</span>
                      <span>CTR {(r.ctr * 100).toFixed(1)}%</span>
                    </div>
                    {r.position <= 10 ? (
                      <Badge variant="success">#{r.position.toFixed(1)}</Badge>
                    ) : (
                      <Badge variant="secondary">#{r.position.toFixed(1)}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Enter your Search Console site URL and click Check Rankings.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)] mb-1">{label}</div>
        <div className="text-2xl font-extrabold font-display">{value}</div>
      </CardContent>
    </Card>
  );
}
