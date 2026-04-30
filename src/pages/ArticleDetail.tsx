import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardPaste, Clock, Code, Download,
  ExternalLink, FileText, Image as ImageIcon, Link2, Linkedin, MessageSquare,
  Sparkles, Twitter, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArticlePerformance } from "@/components/ArticlePerformance";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

type VoiceReview = {
  score: number;
  summary: string;
  strengths: string[];
  issues: Array<{ severity: "low" | "medium" | "high"; quote: string; problem: string; suggestion: string }>;
};

type SeoMeta = {
  tldr?: string;
  keywords?: string[];
  slug?: string;
  readTimeMinutes?: number;
  pullQuotes?: string[];
  imagePrompts?: Array<{ placement: string; prompt: string; altText: string }>;
  socialSnippets?: { linkedin?: string; twitter?: string };
  openGraph?: { title?: string; description?: string; imageAlt?: string };
  internalLinkSuggestions?: Array<{ anchorText: string; topicToLinkTo: string }>;
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
  seoMeta: SeoMeta;
  publishedUrl: string | null;
  companyId: string | null;
  createdAt: string;
};

const copy = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast({ title: `${label} copied to clipboard` });
};

export function ArticleDetailPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: a, isLoading } = useQuery<Article>({
    queryKey: ["article", id],
    queryFn: () => api.get<Article>(`/api/articles/${id}`),
    refetchInterval: (q) => {
      const data = q.state.data as Article | undefined;
      // Poll briefly while supplementary content generates in background
      if (data && (!data.schemaJsonLd || !data.seoMeta?.tldr)) return 4000;
      return false;
    },
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

  const regenSchema = useMutation({
    mutationFn: () => api.post<{ schemaJsonLd: string }>(`/api/articles/${id}/schema`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["article", id] });
      toast({ title: "Schema markup generated" });
    },
    onError: (e: Error) => toast({ title: "Schema generation failed", description: e.message, variant: "destructive" }),
  });

  const regenSeoMeta = useMutation({
    mutationFn: () => api.post<SeoMeta>(`/api/articles/${id}/seo-meta`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["article", id] });
      toast({ title: "SEO extras generated" });
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const submitToGoogle = useMutation({
    mutationFn: (body: { url: string }) => api.post("/api/indexing/submit", body),
    onSuccess: () => toast({ title: "Submitted to Google", description: "Indexing API notified — re-crawl typically within 1–2 hours." }),
    onError: (e: Error) => toast({ title: "Indexing API failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!a) return <div className="p-10 text-muted-foreground">Article not found.</div>;

  const seo = a.seoMeta || {};
  const hasSeoMeta = !!seo.tldr || !!seo.slug;

  const exportDocx = () => {
    const docxBody = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset="utf-8"><title>${escapeHtml(a.title)}</title>
      <style>body{font-family:Calibri,Arial,sans-serif;line-height:1.6}h1{font-size:22pt}h2{font-size:16pt;margin-top:18pt}h3{font-size:13pt}table{border-collapse:collapse}th,td{border:1px solid #999;padding:6pt}</style>
      </head><body>
      ${a.html}
      <hr><p><small><strong>Meta description:</strong> ${escapeHtml(a.metaDescription)}</small></p>
      <p><small><strong>Target keyword:</strong> ${escapeHtml(a.targetKeyword)}</small></p>
      ${seo.keywords?.length ? `<p><small><strong>Keywords:</strong> ${escapeHtml(seo.keywords.join(", "))}</small></p>` : ""}
      </body></html>`;
    const blob = new Blob(["﻿", docxBody], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${seo.slug || slugify(a.title)}.doc`;
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
          {seo.readTimeMinutes ? <span>· <Clock className="inline w-3 h-3" /> {seo.readTimeMinutes} min</span> : null}
          <span>· Target: {a.targetKeyword}</span>
        </div>
      </div>

      {/* Performance card */}
      <div className="mb-4">
        <ArticlePerformance articleId={a.id} publishedUrl={a.publishedUrl} targetKeyword={a.targetKeyword} />
      </div>

      {/* TL;DR — prominent */}
      {seo.tldr && (
        <Card className="mb-4 border-[hsl(36_95%_57%/0.3)] bg-[hsl(36_95%_57%/0.05)]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Badge className="shrink-0 mt-0.5">TL;DR</Badge>
              <p className="text-sm text-foreground/90 leading-relaxed">{seo.tldr}</p>
              <Button size="sm" variant="ghost" onClick={() => copy(seo.tldr || "", "TL;DR")} className="shrink-0 h-7">
                <ClipboardPaste className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">Meta Description</div>
            <Button size="sm" variant="ghost" onClick={() => copy(a.metaDescription, "Meta")} className="h-7">
              <ClipboardPaste className="w-3.5 h-3.5" />
            </Button>
          </div>
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
        <Button size="sm" variant="outline" onClick={() => review.mutate()} disabled={review.isPending} className="ml-auto">
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
            <Button size="sm" onClick={() => submitToGoogle.mutate({ url: submitUrl })} disabled={!submitUrl || submitToGoogle.isPending}>
              {submitToGoogle.isPending ? "Submitting…" : "Notify Google"}
            </Button>
            <button onClick={() => setShowSubmit(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="article">
        <TabsList>
          <TabsTrigger value="article">Article</TabsTrigger>
          <TabsTrigger value="seo">
            SEO Meta {!hasSeoMeta && <span className="ml-1 opacity-50">(generating…)</span>}
          </TabsTrigger>
          <TabsTrigger value="images">
            <ImageIcon className="w-3 h-3 mr-1.5" /> Images
          </TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="schema">Schema</TabsTrigger>
          <TabsTrigger value="review">
            Voice Review {a.voiceReview ? `· ${a.voiceReview.score}/100` : ""}
          </TabsTrigger>
        </TabsList>

        {/* === ARTICLE === */}
        <TabsContent value="article">
          {seo.pullQuotes && seo.pullQuotes.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-5">
                <div className="text-xs font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-3">Pull Quotes</div>
                <div className="space-y-2">
                  {seo.pullQuotes.map((q, i) => (
                    <div key={i} className="flex items-start gap-3 group">
                      <div className="text-2xl text-[hsl(36_95%_57%)] leading-none mt-0.5">"</div>
                      <p className="flex-1 text-sm text-foreground/85 italic">{q}</p>
                      <Button size="sm" variant="ghost" onClick={() => copy(q, "Pull quote")} className="opacity-0 group-hover:opacity-100 h-7">
                        <ClipboardPaste className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-8">
              <div className="article-content" dangerouslySetInnerHTML={{ __html: a.html }} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* === SEO META — for pasting into GHL etc. === */}
        <TabsContent value="seo">
          {!hasSeoMeta ? (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="text-sm text-muted-foreground mb-3">SEO extras (keywords, slug, OG tags, social snippets) haven't been generated for this article yet.</p>
                <Button onClick={() => regenSeoMeta.mutate()} disabled={regenSeoMeta.isPending}>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {regenSeoMeta.isPending ? "Generating…" : "Generate SEO Extras"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <CopyField
                label="Keywords (paste into GHL meta keywords box)"
                value={(seo.keywords ?? []).join(", ")}
                multiline
              />
              <CopyField label="URL slug" value={seo.slug ?? ""} />
              <Card>
                <CardContent className="p-5">
                  <div className="text-xs font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-3">Open Graph / Twitter Card</div>
                  <CopyField label="og:title" value={seo.openGraph?.title ?? ""} />
                  <CopyField label="og:description" value={seo.openGraph?.description ?? ""} />
                  <CopyField label="og:image alt text" value={seo.openGraph?.imageAlt ?? ""} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => copy(buildOgHtml(a, seo), "<head> tags")}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" /> Copy &lt;head&gt; tags
                  </Button>
                </CardContent>
              </Card>
              {seo.internalLinkSuggestions && seo.internalLinkSuggestions.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <div className="text-xs font-bold uppercase tracking-wide text-[hsl(0_0%_55%)] mb-3 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> Internal Linking Suggestions
                    </div>
                    <div className="space-y-2">
                      {seo.internalLinkSuggestions.map((s, i) => (
                        <div key={i} className="text-sm">
                          <span className="text-[hsl(36_95%_57%)] font-semibold">"{s.anchorText}"</span>
                          <span className="text-muted-foreground"> → link to article about </span>
                          <span className="text-foreground">{s.topicToLinkTo}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="text-right">
                <Button size="sm" variant="ghost" onClick={() => regenSeoMeta.mutate()} disabled={regenSeoMeta.isPending}>
                  <Sparkles className="w-3 h-3 mr-1" /> {regenSeoMeta.isPending ? "Regenerating…" : "Regenerate"}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* === IMAGES === */}
        <TabsContent value="images">
          {!seo.imagePrompts || seo.imagePrompts.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="text-sm text-muted-foreground mb-3">No image prompts generated yet.</p>
                <Button onClick={() => regenSeoMeta.mutate()} disabled={regenSeoMeta.isPending}>
                  <Sparkles className="w-4 h-4 mr-1.5" /> {regenSeoMeta.isPending ? "Generating…" : "Generate Image Prompts"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Paste any of these into ChatGPT, Midjourney, DALL-E, or Gemini Image. Alt text is included for accessibility + SEO.
              </p>
              {seo.imagePrompts.map((img, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary">{img.placement}</Badge>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => copy(img.prompt, "Image prompt")}>
                          <ClipboardPaste className="w-3 h-3 mr-1" /> Prompt
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => copy(img.altText, "Alt text")}>
                          <ClipboardPaste className="w-3 h-3 mr-1" /> Alt
                        </Button>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)] mb-1">Prompt</div>
                    <p className="text-sm text-foreground/90 mb-3 leading-relaxed">{img.prompt}</p>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)] mb-1">Alt text</div>
                    <p className="text-xs text-foreground/75 italic">{img.altText}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* === DISTRIBUTION === */}
        <TabsContent value="distribution">
          {!seo.socialSnippets?.linkedin && !seo.socialSnippets?.twitter ? (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="text-sm text-muted-foreground mb-3">Social snippets not generated yet.</p>
                <Button onClick={() => regenSeoMeta.mutate()} disabled={regenSeoMeta.isPending}>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Generate Social Snippets
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[hsl(0_0%_55%)]">
                      <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copy(seo.socialSnippets?.linkedin ?? "", "LinkedIn post")}>
                      <ClipboardPaste className="w-3 h-3 mr-1" /> Copy
                    </Button>
                  </div>
                  <pre className="text-sm text-foreground/85 whitespace-pre-wrap font-sans">{seo.socialSnippets?.linkedin}</pre>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[hsl(0_0%_55%)]">
                      <Twitter className="w-3.5 h-3.5" /> Twitter / X Thread
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copy(seo.socialSnippets?.twitter ?? "", "Twitter thread")}>
                      <ClipboardPaste className="w-3 h-3 mr-1" /> Copy
                    </Button>
                  </div>
                  <pre className="text-sm text-foreground/85 whitespace-pre-wrap font-sans">{seo.socialSnippets?.twitter}</pre>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* === SCHEMA === */}
        <TabsContent value="schema">
          <Card>
            <CardContent className="p-5">
              {a.schemaJsonLd ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">
                      Paste into a <code className="text-[hsl(36_95%_57%)]">&lt;script type="application/ld+json"&gt;</code> tag in your page <code className="text-[hsl(36_95%_57%)]">&lt;head&gt;</code>.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => copy(`<script type="application/ld+json">\n${a.schemaJsonLd}\n</script>`, "Schema markup")}>
                      <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" /> Copy as &lt;script&gt;
                    </Button>
                  </div>
                  <pre className="text-xs font-mono bg-secondary p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                    {tryFormatJson(a.schemaJsonLd)}
                  </pre>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">No schema markup yet.</p>
                  <Button onClick={() => regenSchema.mutate()} disabled={regenSchema.isPending}>
                    <Sparkles className="w-4 h-4 mr-1.5" /> {regenSchema.isPending ? "Generating…" : "Generate Schema Markup"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === VOICE REVIEW === */}
        <TabsContent value="review">
          <Card>
            <CardContent className="p-5">
              {!a.voiceReview ? (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground mb-3">
                    Run a second-pass AI check against the company's BrandScript to flag off-brand passages.
                  </p>
                  <Button onClick={() => review.mutate()} disabled={review.isPending}>
                    <Sparkles className="w-4 h-4 mr-1.5" /> {review.isPending ? "Reviewing…" : "Run Brand Voice Review"}
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

function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(0_0%_50%)]">{label}</div>
        <Button size="sm" variant="ghost" onClick={() => copy(value, label)} className="h-6">
          <ClipboardPaste className="w-3 h-3" />
        </Button>
      </div>
      {multiline ? (
        <div className="text-sm text-foreground bg-secondary border border-border rounded p-3 whitespace-pre-wrap break-words">
          {value || <span className="text-muted-foreground">—</span>}
        </div>
      ) : (
        <div className="text-sm text-foreground bg-secondary border border-border rounded p-2 font-mono">
          {value || <span className="text-muted-foreground">—</span>}
        </div>
      )}
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
            <div className={`text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${sev === "high" ? "text-red-400" : sev === "medium" ? "text-yellow-400" : "text-[hsl(0_0%_55%)]"}`}>
              <AlertTriangle className="w-3.5 h-3.5" /> {sev} priority ({grouped[sev].length})
            </div>
            <div className="space-y-3">
              {grouped[sev].map((issue, i) => (
                <div key={i} className="border border-border rounded-md p-3">
                  <div className="text-xs italic text-foreground/70 border-l-2 border-[hsl(0_0%_30%)] pl-2 mb-2">"{issue.quote}"</div>
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

function buildOgHtml(a: { metaDescription: string; title: string }, seo: SeoMeta): string {
  const og = seo.openGraph || {};
  const ogTitle = og.title || a.title;
  const ogDesc = og.description || a.metaDescription;
  return [
    `<title>${escapeHtml(a.title)}</title>`,
    `<meta name="description" content="${escapeHtml(a.metaDescription)}">`,
    seo.keywords?.length ? `<meta name="keywords" content="${escapeHtml(seo.keywords.join(", "))}">` : "",
    "",
    `<meta property="og:title" content="${escapeHtml(ogTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(ogDesc)}">`,
    `<meta property="og:type" content="article">`,
    "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(ogTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(ogDesc)}">`,
  ].filter(Boolean).join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
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
void MessageSquare;
void ExternalLink;
