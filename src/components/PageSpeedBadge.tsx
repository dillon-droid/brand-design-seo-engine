import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { api } from "@/lib/api";

type Cwv = { value: number; display: string; category: string };
type PageSpeedResult = {
  url: string;
  strategy: "mobile" | "desktop";
  performanceScore: number | null;
  lcp: Cwv | null;
  inp: Cwv | null;
  cls: Cwv | null;
};

/** Compact PageSpeed score badge for a URL — clickable to load + show tooltip. */
export function PageSpeedBadge({ url }: { url: string }) {
  const [data, setData] = useState<{ mobile: PageSpeedResult; desktop: PageSpeedResult } | null>(null);

  const check = useMutation({
    mutationFn: (body: { url: string }) =>
      api.post<{ mobile: PageSpeedResult; desktop: PageSpeedResult }>("/api/pagespeed", body),
    onSuccess: (r) => setData(r),
  });

  const score = data?.mobile.performanceScore;

  if (!data) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          check.mutate({ url });
        }}
        disabled={check.isPending}
        className="text-[10px] text-[hsl(0_0%_50%)] hover:text-[hsl(36_95%_57%)] flex items-center gap-1 disabled:opacity-50"
        title="Check PageSpeed"
      >
        <Gauge className={`w-3 h-3 ${check.isPending ? "animate-pulse" : ""}`} />
        {check.isPending ? "…" : "Speed"}
      </button>
    );
  }

  const tone =
    score == null ? "text-[hsl(0_0%_50%)]" :
    score >= 90 ? "text-green-400" :
    score >= 50 ? "text-yellow-400" :
    "text-red-400";

  return (
    <div
      className={`text-[10px] flex items-center gap-1 ${tone}`}
      title={`Mobile: ${data.mobile.performanceScore ?? "?"}/100 (LCP ${data.mobile.lcp?.display ?? "?"}, CLS ${data.mobile.cls?.display ?? "?"}) · Desktop: ${data.desktop.performanceScore ?? "?"}/100`}
    >
      <Gauge className="w-3 h-3" />
      {score ?? "?"}
    </div>
  );
}
