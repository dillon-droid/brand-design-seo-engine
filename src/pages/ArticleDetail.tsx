import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, ClipboardPaste, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

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
  createdAt: string;
};

export function ArticleDetailPage({ id }: { id: string }) {
  const { data: a, isLoading } = useQuery<Article>({
    queryKey: ["article", id],
    queryFn: () => api.get<Article>(`/api/articles/${id}`),
  });

  if (isLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!a) return <div className="p-10 text-muted-foreground">Article not found.</div>;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/articles" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to Articles
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-extrabold font-display text-foreground mb-2">{a.title}</h1>
        <div className="flex items-center gap-2 text-xs text-[hsl(0_0%_55%)]">
          <Badge variant={a.seoScore >= 80 ? "success" : a.seoScore >= 60 ? "default" : "warning"}>
            SEO {a.seoScore}/100
          </Badge>
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

      <div className="flex items-center gap-2 mb-6">
        <Button size="sm" variant="outline" onClick={() => copy(a.markdown, "Markdown")}>
          <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" /> Copy Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy(a.html, "HTML")}>
          <Code className="w-3.5 h-3.5 mr-1.5" /> Copy HTML for Site Builder
        </Button>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="article-content" dangerouslySetInnerHTML={{ __html: a.html }} />
        </CardContent>
      </Card>
    </div>
  );
}
