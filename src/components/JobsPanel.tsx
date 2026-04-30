import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Check, Clock, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

type Job = {
  id: string;
  companyId: string | null;
  targetKeyword: string;
  status: "pending" | "processing" | "done" | "failed" | "cancelled";
  articleId: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

/**
 * Shows recent article-generation jobs with their status. Polls every 5 seconds
 * while there are pending or processing jobs so the user sees progress live.
 * Auto-hides if there are no jobs.
 */
export function JobsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery<{ jobs: Job[] }>({
    queryKey: ["article-jobs"],
    queryFn: () => api.get("/api/article-jobs"),
    refetchInterval: (q) => {
      const jobs = (q.state.data as { jobs: Job[] } | undefined)?.jobs ?? [];
      const hasActive = jobs.some((j) => j.status === "pending" || j.status === "processing");
      return hasActive ? 5_000 : false;
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/api/article-jobs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["article-jobs"] }),
    onError: (e: Error) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  const pokeNext = useMutation({
    mutationFn: () => api.post("/api/article-jobs/process-next"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["article-jobs"] }),
  });

  const jobs = data?.jobs ?? [];
  // Show the most recent 20 — but always include any pending/processing
  const active = jobs.filter((j) => j.status === "pending" || j.status === "processing");
  const recentDone = jobs.filter((j) => j.status !== "pending" && j.status !== "processing").slice(0, 8);
  const display = [...active, ...recentDone];
  if (display.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[hsl(0_0%_55%)]">
              Article Queue
            </h2>
            {active.length > 0 && (
              <Badge variant="default">
                <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" /> {active.length} in progress
              </Badge>
            )}
          </div>
          {active.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => pokeNext.mutate()} disabled={pokeNext.isPending} title="Process next now">
              <RefreshCw className={`w-3.5 h-3.5 ${pokeNext.isPending ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
        <div className="divide-y divide-border max-h-72 overflow-y-auto">
          {display.map((j) => (
            <div key={j.id} className="flex items-center gap-3 py-2 text-sm">
              <StatusIcon status={j.status} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">{j.targetKeyword}</div>
                {j.errorMessage && (
                  <div className="text-[11px] text-red-400 line-clamp-1">{j.errorMessage}</div>
                )}
                <div className="text-[11px] text-[hsl(0_0%_45%)]">
                  {timeLabel(j)}
                </div>
              </div>
              {j.status === "done" && j.articleId && (
                <Link href={`/articles/${j.articleId}`}>
                  <Button size="sm" variant="outline">View</Button>
                </Link>
              )}
              {j.status === "pending" && (
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate(j.id)}>
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: Job["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="w-4 h-4 text-[hsl(0_0%_50%)] shrink-0" />;
    case "processing":
      return <Loader2 className="w-4 h-4 text-[hsl(36_95%_57%)] animate-spin shrink-0" />;
    case "done":
      return <Check className="w-4 h-4 text-green-400 shrink-0" />;
    case "failed":
      return <X className="w-4 h-4 text-red-400 shrink-0" />;
    case "cancelled":
      return <X className="w-4 h-4 text-[hsl(0_0%_40%)] shrink-0" />;
  }
}

function timeLabel(j: Job): string {
  switch (j.status) {
    case "pending":
      return `queued · ${relativeTime(j.createdAt)}`;
    case "processing":
      return j.startedAt ? `running · ${relativeTime(j.startedAt)}` : "starting…";
    case "done":
      return j.completedAt ? `done · ${relativeTime(j.completedAt)}` : "done";
    case "failed":
      return `failed · ${relativeTime(j.completedAt ?? j.createdAt)}`;
    case "cancelled":
      return `cancelled · ${relativeTime(j.completedAt ?? j.createdAt)}`;
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(0, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
