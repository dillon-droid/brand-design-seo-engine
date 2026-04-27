import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Building2, ChartColumn, FileText, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

type Stats = {
  articlesGenerated: number;
  keywordsTargeted: number;
  avgSeoScore: number;
  totalWordCount: number;
  recentArticles: Array<{ id: string; title: string; targetKeyword: string; createdAt: string }>;
  recentKeywords: Array<{ id: string; keyword: string; companyId: string | null; createdAt: string }>;
};

const StatCard = ({ icon: Icon, label, value, hint }: any) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[hsl(36_95%_57%)]" />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">{label}</div>
      </div>
      <div className="text-2xl font-extrabold font-display text-foreground">{value}</div>
      {hint ? <div className="text-[11px] text-[hsl(0_0%_45%)] mt-0.5">{hint}</div> : null}
    </CardContent>
  </Card>
);

export function DashboardPage() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Stats>("/api/dashboard"),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold font-display text-foreground mb-1">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Keyword research, rank tracking, and AI-powered article generation — all in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard icon={FileText} label="Articles Generated" value={isLoading ? "—" : data?.articlesGenerated ?? 0} />
        <StatCard icon={Search} label="Keywords Targeted" value={isLoading ? "—" : data?.keywordsTargeted ?? 0} />
        <StatCard
          icon={Sparkles}
          label="Avg SEO Score"
          value={isLoading ? "—" : data?.avgSeoScore ? `${data.avgSeoScore}/100` : "—"}
        />
        <StatCard
          icon={ChartColumn}
          label="Total Word Count"
          value={isLoading ? "—" : formatNumber(data?.totalWordCount ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(0_0%_55%)]">Recent Articles</h2>
            <Link href="/articles" className="text-xs text-[hsl(36_95%_57%)] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {data?.recentArticles?.length ? (
              <div className="space-y-3">
                {data.recentArticles.map((a) => (
                  <Link key={a.id} href={`/articles/${a.id}`} className="block group">
                    <div className="text-sm font-semibold text-foreground group-hover:text-[hsl(36_95%_57%)] truncate">
                      {a.title}
                    </div>
                    <div className="text-[11px] text-[hsl(0_0%_45%)]">{a.targetKeyword}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-6 text-center">No articles yet.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(0_0%_55%)]">Recent Keyword Research</h2>
            <Link href="/keywords" className="text-xs text-[hsl(36_95%_57%)] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {data?.recentKeywords?.length ? (
              <div className="space-y-2">
                {data.recentKeywords.map((k) => (
                  <div key={k.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center shrink-0">
                      <Building2 className="w-3 h-3 text-[hsl(36_95%_57%)]" />
                    </div>
                    <div className="text-sm font-semibold text-foreground truncate">{k.keyword}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-6 text-center">No keyword research yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
