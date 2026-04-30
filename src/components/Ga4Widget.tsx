import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Link as LinkIcon, RefreshCw, Users, Activity, Target as TargetIcon, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { formatNumber } from "@/lib/utils";

type GaProperty = { propertyId: string; displayName: string; websiteUrl: string | null; accountName: string | null };
type GaOverview = {
  totals: {
    sessions: number;
    activeUsers: number;
    newUsers: number;
    screenPageViews: number;
    averageSessionDuration: number;
    bounceRate: number;
    conversions: number;
  };
  bySource: Array<{ source: string; medium: string; sessions: number; users: number }>;
  byPage: Array<{ pagePath: string; pageTitle: string; sessions: number; users: number; views: number }>;
};

export function Ga4Widget({
  companyId,
  domain,
  propertyId,
  googleConnected,
}: {
  companyId: string;
  domain: string | null;
  propertyId: string | null;
  googleConnected: boolean;
}) {
  const qc = useQueryClient();
  const [days, setDays] = useState(28);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(propertyId);
  const [showPicker, setShowPicker] = useState(false);

  // Auto-detect on first load if no property is set
  const autoDetect = useMutation({
    mutationFn: () => api.post<{ property: GaProperty | null }>("/api/ga4/auto-detect", { domain }),
    onSuccess: async (r) => {
      if (r.property?.propertyId) {
        await api.patch(`/api/companies/${companyId}`, { ga4PropertyId: r.property.propertyId });
        setSelectedProperty(r.property.propertyId);
        qc.invalidateQueries({ queryKey: ["company", companyId] });
        qc.invalidateQueries({ queryKey: ["companies"] });
        toast({ title: `GA4 connected: ${r.property.displayName}` });
      }
    },
  });

  useEffect(() => {
    if (!selectedProperty && googleConnected && domain && !autoDetect.isPending && !autoDetect.isSuccess && !autoDetect.isError) {
      autoDetect.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleConnected, domain]);

  const { data: properties } = useQuery<{ properties: GaProperty[] }>({
    queryKey: ["ga4-properties"],
    queryFn: () => api.get("/api/ga4/properties"),
    enabled: showPicker && googleConnected,
  });

  const overview = useQuery<GaOverview>({
    queryKey: ["ga4-overview", selectedProperty, days],
    queryFn: () => api.post<GaOverview>("/api/ga4/overview", { propertyId: selectedProperty, days }),
    enabled: !!selectedProperty && googleConnected,
  });

  const setPropertyMut = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/api/companies/${companyId}`, { ga4PropertyId: id });
      setSelectedProperty(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", companyId] });
      setShowPicker(false);
    },
  });

  if (!googleConnected) {
    return null; // GoogleConnect banner is shown elsewhere on the page
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[hsl(36_95%_57%)]" />
            Google Analytics 4
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="text-xs bg-input border border-border rounded px-2 py-1 text-foreground"
            >
              <option value={7}>7 days</option>
              <option value={28}>28 days</option>
              <option value={90}>90 days</option>
            </select>
            <Button size="sm" variant="ghost" onClick={() => overview.refetch()} disabled={overview.isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 ${overview.isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPicker((s) => !s)} title="Pick GA4 property">
              <LinkIcon className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {showPicker && (
          <div className="mb-4 p-3 bg-secondary rounded">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-2">Pick GA4 property</div>
            {!properties ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : properties.properties.length === 0 ? (
              <div className="text-xs text-muted-foreground">Your Google account has no GA4 properties.</div>
            ) : (
              <Select value={selectedProperty ?? ""} onValueChange={(v) => setPropertyMut.mutate(v)}>
                <SelectTrigger><SelectValue placeholder="Select property…" /></SelectTrigger>
                <SelectContent>
                  {properties.properties.map((p) => (
                    <SelectItem key={p.propertyId} value={p.propertyId}>
                      {p.displayName} {p.websiteUrl ? `· ${p.websiteUrl}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {!selectedProperty ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-3">
              {autoDetect.isPending ? "Looking for a matching GA4 property…" :
               autoDetect.isSuccess && !autoDetect.data?.property ? "No GA4 property auto-matched. Pick one manually." :
               "Connect a GA4 property to see traffic, users, and conversions for this client."}
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowPicker(true)}>
              Pick GA4 property
            </Button>
          </div>
        ) : overview.isLoading ? (
          <div className="text-sm text-muted-foreground text-center py-6">Loading GA4 data…</div>
        ) : overview.error ? (
          <div className="text-sm text-red-400 text-center py-6">
            {overview.error instanceof Error ? overview.error.message : "Failed to load GA4 data"}
          </div>
        ) : !overview.data ? null : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <MiniStat icon={Activity} label="Sessions" value={formatNumber(overview.data.totals.sessions)} />
              <MiniStat icon={Users} label="Users" value={formatNumber(overview.data.totals.activeUsers)} hint={`${formatNumber(overview.data.totals.newUsers)} new`} />
              <MiniStat icon={BarChart3} label="Pageviews" value={formatNumber(overview.data.totals.screenPageViews)} />
              <MiniStat icon={TargetIcon} label="Conversions" value={formatNumber(overview.data.totals.conversions)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-2">Top Sources</div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {overview.data.bySource.slice(0, 8).map((s, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 text-xs">
                      <div className="flex-1 truncate">
                        <span className="text-foreground font-semibold">{s.source}</span>
                        <span className="text-[hsl(0_0%_50%)]"> / {s.medium}</span>
                      </div>
                      <span className="text-[hsl(0_0%_70%)] tabular-nums">{formatNumber(s.sessions)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-2">Top Pages</div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {overview.data.byPage.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="text-foreground font-semibold truncate">{p.pageTitle || p.pagePath}</div>
                        <div className="text-[10px] text-[hsl(0_0%_45%)] truncate flex items-center gap-1">
                          {p.pagePath} {domain && <a href={`https://${domain.replace(/^https?:\/\//, "")}${p.pagePath}`} target="_blank" rel="noreferrer" className="hover:text-[hsl(36_95%_57%)]"><ExternalLink className="w-2.5 h-2.5" /></a>}
                        </div>
                      </div>
                      <span className="text-[hsl(0_0%_70%)] tabular-nums">{formatNumber(p.sessions)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value, hint }: { icon: typeof BarChart3; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-secondary border border-border rounded p-3">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xl font-extrabold font-display">{value}</div>
      {hint ? <div className="text-[10px] text-[hsl(0_0%_45%)]">{hint}</div> : null}
    </div>
  );
}
