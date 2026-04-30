import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArticleForm, type ArticleFormPayload } from "@/components/ArticleForm";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JobsPanel } from "@/components/JobsPanel";
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

  const { data: articles = [], isLoading: articlesLoading } = useQuery<Article[]>({
    queryKey: ["articles"],
    queryFn: () => api.get<Article[]>("/api/articles"),
  });

  const { data: companies = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["companies"],
    queryFn: () => api.get("/api/companies"),
  });

  const [filterText, setFilterText] = useState("");
  const [filterCompany, setFilterCompany] = useState("all");

  const filteredArticles = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return articles.filter((a) => {
      if (filterCompany !== "all" && a.companyId !== filterCompany) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.targetKeyword.toLowerCase().includes(q) ||
        a.metaDescription.toLowerCase().includes(q)
      );
    });
  }, [articles, filterText, filterCompany]);

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

      <JobsPanel />

      {articles.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(0_0%_50%)] pointer-events-none" />
              <Input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Search title, keyword, or meta…"
                className="pl-9"
              />
            </div>
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground shrink-0">
              {filteredArticles.length} of {articles.length}
            </span>
          </CardContent>
        </Card>
      )}

      {articlesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-5">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-secondary rounded w-3/4" />
                <div className="h-3 bg-secondary rounded w-1/2" />
                <div className="h-3 bg-secondary rounded w-1/3" />
              </div>
            </CardContent></Card>
          ))}
        </div>
      ) : articles.length === 0 ? (
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
      ) : filteredArticles.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12">No articles match your filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredArticles.map((a) => (
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
