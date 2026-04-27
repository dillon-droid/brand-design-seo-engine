import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArticleQuiz, type QuizAnswers } from "@/components/ArticleQuiz";
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
  const [openQuiz, setOpenQuiz] = useState(false);

  const { data: articles = [] } = useQuery<Article[]>({
    queryKey: ["articles"],
    queryFn: () => api.get<Article[]>("/api/articles"),
  });

  const generate = useMutation({
    mutationFn: (body: QuizAnswers & { companyId?: string; targetKeyword: string; secondaryKeywords: string[] }) =>
      api.post<Article>("/api/articles/generate", body),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      setOpenQuiz(false);
      toast({ title: "Article generated", description: a.title });
      window.location.href = `/articles/${a.id}`;
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-foreground mb-1">Article Generator</h1>
          <p className="text-sm text-muted-foreground">
            Answer a few questions, get a full SEO article written in the Brand Design voice.
          </p>
        </div>
        <Button onClick={() => setOpenQuiz(true)}>
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
            <p className="text-xs text-muted-foreground mb-4">Answer a few questions and generate your first article.</p>
            <Button onClick={() => setOpenQuiz(true)}>Generate your first article</Button>
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

      <Dialog open={openQuiz} onOpenChange={setOpenQuiz}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Generate Article</DialogTitle>
          </DialogHeader>
          <ArticleQuiz onSubmit={(d) => generate.mutate(d)} submitting={generate.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
