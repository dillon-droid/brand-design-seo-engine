import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export type ArticleFormPayload = {
  companyId?: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  length: "short" | "medium" | "long";
  // 7 optional StoryBrand-quiz overrides — leave blank and the AI defaults to the company's BrandScript
  whoIsTheReader: string;
  whatProblem: string;
  howDoesItMakeThemFeel: string;
  whyTrustYou: string;
  whatShouldTheyDo: string;
  whatDoesSuccessLook: string;
  whatHappensIfTheyDont: string;
};

const LENGTHS = [
  { value: "short", label: "Short (~800 words)" },
  { value: "medium", label: "Medium (~1500 words)" },
  { value: "long", label: "Long (~2500 words)" },
] as const;

/**
 * Single-page article setup. The 7 StoryBrand fields are NOT asked here —
 * the AI uses the company's BrandScript from the database. Click "Customize
 * the angle" to override any of them for this specific article.
 */
export function ArticleForm({
  onSubmit,
  submitting,
  initialTargetKeyword,
  initialCompanyId,
}: {
  onSubmit: (d: ArticleFormPayload) => void;
  submitting?: boolean;
  initialTargetKeyword?: string;
  initialCompanyId?: string;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [targetKeyword, setTargetKeyword] = useState(initialTargetKeyword ?? "");
  const [secondaryRaw, setSecondaryRaw] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");

  const [advanced, setAdvanced] = useState(false);
  const [whoIsTheReader, setWhoIsTheReader] = useState("");
  const [whatProblem, setWhatProblem] = useState("");
  const [howDoesItMakeThemFeel, setHowDoesItMakeThemFeel] = useState("");
  const [whyTrustYou, setWhyTrustYou] = useState("");
  const [whatShouldTheyDo, setWhatShouldTheyDo] = useState("");
  const [whatDoesSuccessLook, setWhatDoesSuccessLook] = useState("");
  const [whatHappensIfTheyDont, setWhatHappensIfTheyDont] = useState("");

  const { data: companies = [] } = useQuery<Array<{ id: string; name: string; brandScript?: string; sbHero?: string }>>({
    queryKey: ["companies"],
    queryFn: () => api.get("/api/companies"),
  });
  const company = companies.find((c) => c.id === companyId);
  const hasBrandScript = !!company && (company.brandScript || company.sbHero);

  const handleGenerate = () => {
    onSubmit({
      companyId: companyId || undefined,
      targetKeyword,
      secondaryKeywords: secondaryRaw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      length,
      whoIsTheReader,
      whatProblem,
      howDoesItMakeThemFeel,
      whyTrustYou,
      whatShouldTheyDo,
      whatDoesSuccessLook,
      whatHappensIfTheyDont,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <Label>Company</Label>
        <Select value={companyId || "none"} onValueChange={(v) => setCompanyId(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Select a company…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(no company — generic article)</SelectItem>
            {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {company && (
          <p className="text-[11px] text-[hsl(0_0%_50%)] mt-1.5">
            {hasBrandScript ? (
              <span className="text-green-400">✓ Using {company.name}'s BrandScript for reader, problem, voice, and CTA.</span>
            ) : (
              <span className="text-yellow-400">⚠ {company.name} has no BrandScript saved. Article will be generic — fill in the company's StoryBrand fields for better output.</span>
            )}
          </p>
        )}
      </div>

      <div>
        <Label>Target Keyword</Label>
        <Input
          value={targetKeyword}
          onChange={(e) => setTargetKeyword(e.target.value)}
          placeholder="The main search term you want this article to rank for."
          autoFocus={!targetKeyword}
        />
      </div>

      <div>
        <Label>Secondary Keywords <span className="opacity-50">(optional)</span></Label>
        <Textarea
          rows={2}
          value={secondaryRaw}
          onChange={(e) => setSecondaryRaw(e.target.value)}
          placeholder="Other terms to weave in naturally — comma or newline separated."
        />
      </div>

      <div>
        <Label>Article Length</Label>
        <Select value={length} onValueChange={(v) => setLength(v as "short" | "medium" | "long")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {LENGTHS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          className="flex items-center gap-1.5 text-xs text-[hsl(0_0%_55%)] hover:text-foreground"
        >
          {advanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Customize the angle for this specific article (optional)
        </button>
        {advanced && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-[hsl(0_0%_50%)]">
              Override any of these to give this one article a different angle than the company's default StoryBrand. Leave blank to use the company's saved BrandScript.
            </p>
            <Q label="Who is the reader (different from default)?" value={whoIsTheReader} onChange={setWhoIsTheReader} />
            <Q label="Specific problem they searched for" value={whatProblem} onChange={setWhatProblem} />
            <Q label="How does it make them feel" value={howDoesItMakeThemFeel} onChange={setHowDoesItMakeThemFeel} />
            <Q label="Why should they trust us (this article specifically)" value={whyTrustYou} onChange={setWhyTrustYou} />
            <Q label="What should they do after reading" value={whatShouldTheyDo} onChange={setWhatShouldTheyDo} />
            <Q label="What does success look like" value={whatDoesSuccessLook} onChange={setWhatDoesSuccessLook} />
            <Q label="What happens if they don't act" value={whatHappensIfTheyDont} onChange={setWhatHappensIfTheyDont} />
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleGenerate} disabled={!targetKeyword || submitting}>
          <Sparkles className="w-4 h-4 mr-1.5" />
          {submitting ? "Generating…" : "Generate Article"}
        </Button>
      </div>
    </div>
  );
}

function Q({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] normal-case tracking-normal font-semibold text-[hsl(0_0%_55%)]">{label}</Label>
      <Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
    </div>
  );
}
