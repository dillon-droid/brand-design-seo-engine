import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Link2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

type GoogleStatus = {
  connected: boolean;
  email: string | null;
  scopes: string[];
  configured: boolean;
};

/**
 * Banner that prompts the user to connect their Google account before they can
 * use any Google-API-backed feature (Rankings, GSC Opportunity Mine, PageSpeed).
 *
 * Shows three states:
 * 1. Server has no GOOGLE_OAUTH_CLIENT_ID — explain the setup is incomplete
 * 2. User has not connected — show "Connect Google" button
 * 3. User is connected — show their email + disconnect option
 */
export function GoogleConnect({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();

  const { data: status } = useQuery<GoogleStatus>({
    queryKey: ["google-status"],
    queryFn: () => api.get("/api/google/status"),
    refetchInterval: 30_000,
  });

  // After OAuth callback redirects back, ?google=connected is in the URL — show toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("google");
    if (!flag) return;
    if (flag === "connected") {
      toast({ title: "Google connected" });
      qc.invalidateQueries({ queryKey: ["google-status"] });
    } else {
      toast({ title: "Google connect failed", description: flag, variant: "destructive" });
    }
    params.delete("google");
    const url = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", url);
  }, [qc]);

  const start = useMutation({
    mutationFn: () => api.get<{ url: string }>("/api/google/oauth/start"),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast({ title: "Could not start Google sign-in", description: e.message, variant: "destructive" }),
  });

  const disconnect = useMutation({
    mutationFn: () => api.post("/api/google/oauth/disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google-status"] });
      toast({ title: "Google disconnected" });
    },
  });

  if (!status) return null;

  if (!status.configured) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5 mb-4">
        <CardContent className="p-4 flex items-center gap-3">
          <Unplug className="w-5 h-5 text-yellow-400 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">Google OAuth not yet configured</div>
            <div className="text-xs text-[hsl(0_0%_60%)] mt-0.5">
              Set <code className="text-[hsl(36_95%_57%)]">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
              <code className="text-[hsl(36_95%_57%)]">GOOGLE_OAUTH_CLIENT_SECRET</code> in your environment, then redeploy.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status.connected) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4 flex items-center gap-3">
          <Link2 className="w-5 h-5 text-[hsl(36_95%_57%)] shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">Connect your Google account</div>
            <div className="text-xs text-[hsl(0_0%_60%)] mt-0.5">
              Required for Rankings + GSC Opportunity Mine. We'll only request read access to Search Console, GA4, and Indexing.
            </div>
          </div>
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? "Redirecting…" : "Connect Google"}
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-[hsl(0_0%_55%)]">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
        Connected as {status.email}
      </div>
    );
  }

  return (
    <Card className="border-green-500/20 bg-green-500/5 mb-4">
      <CardContent className="p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-bold text-foreground">Google connected</div>
          <div className="text-xs text-[hsl(0_0%_60%)] mt-0.5">{status.email}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
          Disconnect
        </Button>
      </CardContent>
    </Card>
  );
}
