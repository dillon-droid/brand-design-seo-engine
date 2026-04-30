import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardPaste, Code, Download,
  ExternalLink, FileText, Sparkles, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

type VoiceReview = {
  score: number;
  summary: string;
  strengths: string[];
  issues: Array<{ severity: "low" | "medium" | "high"; quote: string; problem: string; suggestion: string }>;
};

type Article = {
  id: string;
  title: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  metaDescription: string;
  markdown: string;
  html: string;
  seoScore: number;
  wordCount: number;
  schemaJsonLd: string;
  voiceReview: VoiceReview | null;
  companyId: string | null;
  createdAt: string;
};

export function ArticleDetailPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: a, isLoading } = useQuery<Article>({
    queryKey: ["article", id],
    queryFn: () => api.get<Article>(`/api/articles/${id}`),
  });

  const [submitUrl, setSubmitUrl] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);

  const review = useMutation({
    mutationFn: () => api.post<VoiceReview>(`/api/articles/${id}/review`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["article", id] });
      toast({ title: "Brand voice review complete" });
    },
    onError: (e: Error) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  const submitToGoogle = useMutation({
    mutationFn: (body: { url: string }) => api.post("/api/indexing/submit", body),
    onSuccess: () => toast({ title: "Submitted to Google", description: "Indexing API notified — re-crawl typically within 1–2 hours." }),
    onError: (e: Error) => toast({ title: "Indexing API failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!a) return <div className="p-10 text-muted-foreground">Article not found.</div>;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const exportDocx = () => {
    // Simple HTML-as-docx export. Word opens .doc with HTML body just fine.
    const docxBody = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(a.title)}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; line-height: 1.6; }
          h1 { font-size: 22pt; }
          h2 { font-size: 16pt; margin-top: 18pt; }
          h3 { font-size: 13pt; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #999; padding: 6pt; }
        </style>
      </head>
      <body>
        ${a.html}
        <hr>
        <p><small><strong>Meta description:</strong> ${escapeHtml(a.metaDescription)}</small></p>
        <p><small><strong>Target keyword:</strong> ${escapeHtml(a.targetKeyword)}</small></p>
      </body>
      </html>
    `;
    const blob = new Blob(["﻿", docxBody], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(a.title)}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/articles" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to Articles
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-extrabold font-display text-foreground mb-2">{a.title}</h1>
        <div className="flex items-center gap-2 text-xs text-[hsl(0_0%_55%)] flex-wrap">
          <Badge variant={a.seoScore >= 80 ? "success" : a.seoScore >= 60 ? "default" : "warning"}>
            SEO {a.seoScore}/100
          </Badge>
          {a.voiceReview && (
            <Badge variant={a.voiceReview.score >= 80 ? "success" : a.voiceReview.score >= 60 ? "default" : "warning"}>
              Voice {a.voiceReview.score}/100
            </Badge>
          )}
          <span>{a.wordCount.toLocaleString()} words</span>
          <span>· Target: {a.targetKeyword}</span>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)] mb-2">Meta Description</div>
          <p className="text-sm text-foreground/90">{a.metaDescription}</p>
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => copy(a.markdown, "Markdown")}>
          <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" /> Copy Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy(a.html, "HTML")}>
          <Code className="w-3.5 h-3.5 mr-1.5" /> Copy HTML
        </Button>
        <Button size="sm" variant="outline" onClick={exportDocx}>
          <Download className="w-3.5 h-3.5 mr-1.5" /> Download .doc
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => review.mutate()}
          disabled={review.isPending}
          className="ml-auto"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          {review.isPending ? "Reviewing…" : a.voiceReview ? "Re-review brand voice" : "Brand voice review"}
        </Button>
        <Button size="sm" onClick={() => setShowSubmit((s) => !s)}>
          <Zap className="w-3.5 h-3.5 mr-1.5" /> Submit to Google
        </Button>
      </div>

      {showSubmit && (
        <Card className="mb-4 border-[hsl(36_95%_57%/0.3)]">
          <CardContent className="p-4 flex items-center gap-3">
            <input
              value={submitUrl}
              onChange={(e) => setSubmitUrl(e.target.value)}
              placeholder="https://example.com/your-published-article"
              className="flex-1 h-9 rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground"
            />
            <Button
              size="sm"
              onClick={() => submitToGoogle.mutate({ url: submitUrl })}
              disabled={!submitUrl || submitToGoogle.isPending}
            >
              {submitToGoogle.isPending ? "Submitting…" : "Notify Google"}
            </Button>
            <button onClick={() => setShowSubmit(false)} className="text-[11px] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="article">
        <TabsList>
          <TabsTrigger value="article">Article</TabsTrigger>
          <TabsTrigger value="schema">Schema (JSON-LD)</TabsTrigger>
          <TabsTrigger value="review">
            Voice Review {a.voiceReview ? `· ${a.voiceReview.score}/100` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="article">
          <Card>
            <CardContent className="p-8">
              <div className="article-content" dangerouslySetInnerHTML={{ __html: a.html }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schema">
          <Card>
            <CardContent className="p-5">
              {a.schemaJsonLd ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">
                      Paste this into a <code className="text-[hsl(36_95%_57%)]">&lt;script type="application/ld+json"&gt;</code> tag in your page <code className="text-[hsl(36_95%_57%)]">&lt;head&gt;</code>.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copy(`<script type="application/ld+json">\n${a.schemaJsonLd}\n</script>`, "Schema markup")}
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" /> Copy as &lt;script&gt;
                    </Button>
                  </div>
                  <pre className="text-xs font-mono bg-secondary p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                    {tryFormatJson(a.schemaJsonLd)}
                  </pre>
                  <a
                    href={`https://search.google.com/test/rich-results?url=${encodeURIComponent("data:application/ld+json," + a.schemaJsonLd)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[hsl(36_95%_57%)] hover:underline mt-3 inline-flex items-center gap-1"
                  >
                    Test in Google Rich Results <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No schema markup. Regenerate this article to get JSON-LD.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <Card>
            <CardContent className="p-5">
              {!a.voiceReview ? (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground mb-3">
                    Run a second-pass AI check against the company's BrandScript to flag off-brand passages.
                  </p>
                  <Button onClick={() => review.mutate()} disabled={review.isPending}>
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    {review.isPending ? "Reviewing…" : "Run Brand Voice Review"}
                  </Button>
                </div>
              ) : (
                <ReviewPanel review={a.voiceReview} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReviewPanel({ review }: { review: VoiceReview }) {
  const grouped = {
    high: review.issues.filter((i) => i.severity === "high"),
    medium: review.issues.filter((i) => i.severity === "medium"),
    low: review.issues.filter((i) => i.severity === "low"),
  };
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="text-5xl font-extrabold font-display text-foreground">{review.score}</div>
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">on-brand score</div>
          <p className="text-sm text-foreground/85 mt-1">{review.summary}</p>
        </div>
      </div>

      {review.strengths.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-green-400 mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
          </div>
          <ul className="text-sm text-foreground/85 space-y-1">
            {review.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-green-400">✓</span><span>{s}</span></li>)}
          </ul>
        </div>
      )}

      {(["high", "medium", "low"] as const).map((sev) =>
        grouped[sev].length > 0 ? (
          <div key={sev}>
            <div
              className={`text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${
                sev === "high" ? "text-red-400" : sev === "medium" ? "text-yellow-400" : "text-[hsl(0_0%_55%)]"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> {sev} priority ({grouped[sev].length})
            </div>
            <div className="space-y-3">
              {grouped[sev].map((issue, i) => (
                <div key={i} className="border border-border rounded-md p-3">
                  <div className="text-xs italic text-foreground/70 border-l-2 border-[hsl(0_0%_30%)] pl-2 mb-2">
                    "{issue.quote}"
                  </div>
                  <div className="text-sm text-foreground mb-1.5">{issue.problem}</div>
                  <div className="text-sm text-[hsl(36_95%_57%)] flex items-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {issue.suggestion}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null,
      )}

      {review.issues.length === 0 && (
        <div className="text-sm text-green-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> No on-brand issues flagged. Great work.
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function tryFormatJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

void FileText;
