import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArticleForm, type ArticleFormPayload } from "@/components/ArticleForm";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

type Article = {
  id: string;
  title: string;
  targetKeyword: string;
  metaDescription: string;
  seoScore: number;
  wordCount: number;
  companyId: string | null;
  createdAt: string;
};

export function ArticlesPage() {
  const qc = useQueryClient();
  const search = useSearch();
  const [openForm, setOpenForm] = useState(false);
  const [prefill, setPrefill] = useState<{ targetKeyword?: string; companyId?: string }>({});

  // When navigated to /articles?keyword=X&companyId=Y, auto-open the dialog with values pre-filled.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const kw = params.get("keyword");
    const cid = params.get("companyId");
    if (kw || cid) {
      setPrefill({ targetKeyword: kw ?? undefined, companyId: cid ?? undefined });
      setOpenForm(true);
      // Clean URL after consuming params so refresh doesn't re-trigger
      const url = window.location.pathname;
      window.history.replaceState({}, "", url);
    }
  }, [search]);

  const { data: articles = [] } = useQuery<Article[]>({
    queryKey: ["articles"],
    queryFn: () => api.get<Article[]>("/api/articles"),
  });

  const generate = useMutation({
    mutationFn: (body: ArticleFormPayload) => api.post<Article>("/api/articles/generate", body),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      setOpenForm(false);
      toast({ title: "Article generated", description: a.title });
      window.location.href = `/articles/${a.id}`;
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const handleOpen = (open: boolean) => {
    setOpenForm(open);
    if (!open) setPrefill({});
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-foreground mb-1">Articles</h1>
          <p className="text-sm text-muted-foreground">
            Pick a company + keyword and generate a full SEO article in their brand voice.
          </p>
        </div>
        <Button onClick={() => setOpenForm(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Generate Article
        </Button>
      </div>

      {articles.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-[hsl(36_95%_57%)]" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">No articles yet.</p>
            <p className="text-xs text-muted-foreground mb-4">Pick a company + target keyword and generate one in seconds.</p>
            <Button onClick={() => setOpenForm(true)}>Generate your first article</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((a) => (
            <Link key={a.id} href={`/articles/${a.id}`}>
              <Card className="hover:border-[hsl(36_95%_57%/0.3)] transition-colors cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-[hsl(36_95%_57%)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground line-clamp-2 group-hover:text-[hsl(36_95%_57%)]">{a.title}</div>
                      <div className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5">Target: {a.targetKeyword}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[hsl(0_0%_55%)]">
                    <Badge variant={a.seoScore >= 80 ? "success" : a.seoScore >= 60 ? "default" : "warning"}>
                      SEO {a.seoScore}/100
                    </Badge>
                    <span>{a.wordCount.toLocaleString()} words</span>
                    <ArrowRight className="w-3 h-3 ml-auto text-[hsl(0_0%_50%)] group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={openForm} onOpenChange={handleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Article</DialogTitle>
          </DialogHeader>
          <ArticleForm
            onSubmit={(d) => generate.mutate(d)}
            submitting={generate.isPending}
            initialTargetKeyword={prefill.targetKeyword}
            initialCompanyId={prefill.companyId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
