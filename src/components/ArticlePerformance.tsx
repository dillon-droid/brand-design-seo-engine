import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { formatNumber } from "@/lib/utils";

type RankSnapshot = {
  id: string;
  keyword: string;
  page: string | null;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  fetchedAt: string;
};

export function ArticlePerformance({
  articleId,
  publishedUrl,
  targetKeyword,
}: {
  articleId: string;
  publishedUrl: string | null;
  targetKeyword: string;
}) {
  const qc = useQueryClient();
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(publishedUrl ?? "");

  const { data: history } = useQuery<{ rows: RankSnapshot[] }>({
    queryKey: ["article-rank-history", articleId],
    queryFn: () => api.get(`/api/articles/${articleId}/rank-history?days=90`),
  });

  const snapshot = useMutation({
    mutationFn: () => api.post(`/api/articles/${articleId}/snapshot`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["article-rank-history", articleId] });
      toast({ title: "Snapshot taken" });
    },
    onError: (e: Error) => toast({ title: "Snapshot failed", description: e.message, variant: "destructive" }),
  });

  const setUrl = useMutation({
    mutationFn: (publishedUrl: string | null) =>
      api.patch(`/api/articles/${articleId}/publish-url`, { publishedUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["article", articleId] });
      setEditingUrl(false);
      toast({ title: "Published URL saved" });
    },
  });

  const rows = history?.rows ?? [];
  const latest = rows[0];
  const previous = rows[1];
  const delta = latest && previous ? latest.position - previous.position : 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-[hsl(36_95%_57%)]" />
            Performance — "{targetKeyword}"
          </h2>
          <Button size="sm" variant="ghost" onClick={() => snapshot.mutate()} disabled={snapshot.isPending} title="Take snapshot now">
            <RefreshCw className={`w-3.5 h-3.5 ${snapshot.isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {!publishedUrl && !editingUrl ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground mb-2">
              Add the URL where this article was published to track its rankings + traffic.
            </p>
            <Button size="sm" onClick={() => setEditingUrl(true)}>Set published URL</Button>
          </div>
        ) : editingUrl ? (
          <div className="flex items-end gap-2 mb-3">
            <div className="flex-1">
              <Label>Published URL</Label>
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://your-site.com/blog/article-slug"
              />
            </div>
            <Button size="sm" onClick={() => setUrl.mutate(urlInput || null)} disabled={setUrl.isPending}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingUrl(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="text-[11px] text-[hsl(0_0%_50%)] mb-3 flex items-center gap-2">
            <span>Tracking</span>
            <a href={publishedUrl!} target="_blank" rel="noreferrer" className="text-[hsl(36_95%_57%)] hover:underline truncate">
              {publishedUrl}
            </a>
            <button onClick={() => { setUrlInput(publishedUrl ?? ""); setEditingUrl(true); }} className="text-[hsl(0_0%_45%)] hover:text-foreground">
              edit
            </button>
          </div>
        )}

        {!latest ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No ranking data yet. {publishedUrl ? "Click refresh to take the first snapshot — daily snapshots run automatically at 6am UTC." : "Add the published URL above first."}
          </div>
        ) : (
          <>
            {/* Headline metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Metric
                label="Position"
                value={latest.position.toFixed(1)}
                delta={previous ? <DeltaBadge delta={delta} positionLower /> : null}
              />
              <Metric label="Impressions" value={formatNumber(latest.impressions)} />
              <Metric label="Clicks" value={formatNumber(latest.clicks)} />
              <Metric label="CTR" value={`${(latest.ctr * 100).toFixed(1)}%`} />
            </div>

            {/* Sparkline */}
            {rows.length >= 2 && <Sparkline rows={[...rows].reverse()} />}

            <div className="text-[10px] text-[hsl(0_0%_45%)] mt-2">
              Last snapshot: {new Date(latest.fetchedAt).toLocaleString()}
              {rows.length > 1 ? ` · ${rows.length} snapshots over ${daysSinceFirst(rows)} days` : ""}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  return (
    <div className="bg-secondary border border-border rounded p-3">
      <div className="text-[9px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-xl font-extrabold font-display">{value}</div>
        {delta}
      </div>
    </div>
  );
}

function DeltaBadge({ delta, positionLower }: { delta: number; positionLower?: boolean }) {
  // For position: lower is better. So `delta < 0` means position improved.
  if (Math.abs(delta) < 0.1) return <Badge variant="secondary" className="text-[10px]"><Minus className="w-2.5 h-2.5" /></Badge>;
  const improved = positionLower ? delta < 0 : delta > 0;
  const arrow = improved ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />;
  return (
    <Badge variant={improved ? "success" : "warning"} className="text-[10px]">
      {arrow} {Math.abs(delta).toFixed(1)}
    </Badge>
  );
}

function Sparkline({ rows }: { rows: RankSnapshot[] }) {
  // Show position over time. Lower = better, so we invert the y-axis.
  const positions = rows.map((r) => r.position);
  const minP = Math.min(...positions);
  const maxP = Math.max(...positions);
  const span = Math.max(1, maxP - minP);
  const w = 600;
  const h = 60;
  const stepX = rows.length > 1 ? w / (rows.length - 1) : w;
  const points = rows.map((r, i) => {
    const x = i * stepX;
    const y = ((r.position - minP) / span) * (h - 8) + 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="mt-2">
      <div className="text-[9px] uppercase tracking-wide text-[hsl(0_0%_45%)] mb-1 flex justify-between">
        <span>Position over time (lower = better)</span>
        <span>{rows[0].position.toFixed(1)} → {rows[rows.length - 1].position.toFixed(1)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16 bg-secondary rounded">
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="hsl(36 95% 57%)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {rows.map((_, i) => {
          const [x, y] = points[i].split(",");
          return <circle key={i} cx={x} cy={y} r="2.5" fill="hsl(36 95% 57%)" />;
        })}
      </svg>
    </div>
  );
}

function daysSinceFirst(rows: RankSnapshot[]): number {
  if (rows.length === 0) return 0;
  const first = new Date(rows[rows.length - 1].fetchedAt).getTime();
  const last = new Date(rows[0].fetchedAt).getTime();
  return Math.max(1, Math.round((last - first) / 86400_000));
}
