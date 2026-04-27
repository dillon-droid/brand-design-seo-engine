import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export type QuizAnswers = {
  whoIsTheReader: string;
  whatProblem: string;
  howDoesItMakeThemFeel: string;
  whyTrustYou: string;
  whatShouldTheyDo: string;
  whatDoesSuccessLook: string;
  whatHappensIfTheyDont: string;
};

const empty: QuizAnswers = {
  whoIsTheReader: "",
  whatProblem: "",
  howDoesItMakeThemFeel: "",
  whyTrustYou: "",
  whatShouldTheyDo: "",
  whatDoesSuccessLook: "",
  whatHappensIfTheyDont: "",
};

const QUIZ: Array<{ key: keyof QuizAnswers; q: string; placeholder: string; helper?: string }> = [
  {
    key: "whoIsTheReader",
    q: "Who is the reader?",
    placeholder: "A homeowner in Michigan who needs a new roof but doesn't know where to start or what it should cost.",
    helper: "The Hero (Customer)",
  },
  {
    key: "whatProblem",
    q: "What's the specific problem that made them search Google?",
    placeholder: "Their roof is leaking and they need to find a reliable contractor fast.",
  },
  {
    key: "howDoesItMakeThemFeel",
    q: "How does this problem make them feel?",
    placeholder: "Overwhelmed by quotes, scared of getting ripped off, stressed about the cost.",
    helper: "The frustration or worry underneath the surface-level problem.",
  },
  {
    key: "whyTrustYou",
    q: "Why should they trust you?",
    placeholder: "Experience, credentials, results — what makes you the right choice…",
  },
  {
    key: "whatShouldTheyDo",
    q: "What should they do after reading?",
    placeholder: "Get a free estimate, contact us, schedule an inspection…",
    helper: "The one action you want them to take after reading.",
  },
  {
    key: "whatDoesSuccessLook",
    q: "What does success look like?",
    placeholder: "A brand new roof they can trust for 30 years, installed on time and on budget.",
  },
  {
    key: "whatHappensIfTheyDont",
    q: "What happens if they don't act?",
    placeholder: "Water damage gets worse, repair costs double, and they end up in an emergency situation.",
    helper: "The cost of not solving this.",
  },
];

const LENGTHS = [
  { value: "short", label: "Short (~800 words)" },
  { value: "medium", label: "Medium (~1500 words)" },
  { value: "long", label: "Long (~2500 words)" },
];

export function ArticleQuiz({
  onSubmit,
  submitting,
}: {
  onSubmit: (d: QuizAnswers & { companyId?: string; targetKeyword: string; secondaryKeywords: string[]; length: string }) => void;
  submitting?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [companyId, setCompanyId] = useState<string>("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [secondaryRaw, setSecondaryRaw] = useState("");
  const [length, setLength] = useState("medium");
  const [answers, setAnswers] = useState<QuizAnswers>(empty);

  const { data: companies = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["companies"],
    queryFn: () => api.get<any>("/api/companies"),
  });

  const totalSteps = QUIZ.length + 1; // last step = setup
  const isSetup = step === totalSteps - 1;

  const handleNext = () => setStep((s) => Math.min(s + 1, totalSteps - 1));
  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleGenerate = () => {
    onSubmit({
      ...answers,
      companyId: companyId || undefined,
      targetKeyword,
      secondaryKeywords: secondaryRaw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      length,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded ${i <= step ? "bg-[hsl(36_95%_57%)]" : "bg-secondary"}`}
          />
        ))}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(0_0%_55%)]">
        Step {step + 1} of {totalSteps}
      </div>

      {!isSetup ? (
        <div>
          <h3 className="text-xl font-extrabold font-display text-foreground mb-1">{QUIZ[step].q}</h3>
          {QUIZ[step].helper ? (
            <p className="text-xs text-muted-foreground mb-3">{QUIZ[step].helper}</p>
          ) : null}
          <Textarea
            rows={4}
            value={answers[QUIZ[step].key]}
            onChange={(e) => setAnswers((a) => ({ ...a, [QUIZ[step].key]: e.target.value }))}
            placeholder={QUIZ[step].placeholder}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-xl font-extrabold font-display text-foreground mb-1">Final setup</h3>
          <div>
            <Label>Company (optional)</Label>
            <Select value={companyId || "none"} onValueChange={(v) => setCompanyId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="(no company)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">(no company)</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Target Keyword</Label>
            <Input
              value={targetKeyword}
              onChange={(e) => setTargetKeyword(e.target.value)}
              placeholder="The main search term you want this article to show up for on Google."
            />
          </div>
          <div>
            <Label>Secondary Keywords</Label>
            <Textarea
              rows={2}
              value={secondaryRaw}
              onChange={(e) => setSecondaryRaw(e.target.value)}
              placeholder="Add related search terms… (comma or newline separated)"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Other terms people might search. These get woven into the article naturally.
            </p>
          </div>
          <div>
            <Label>Article Length</Label>
            <Select value={length} onValueChange={setLength}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LENGTHS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={handleBack} disabled={step === 0}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {!isSetup ? (
          <Button onClick={handleNext} disabled={!answers[QUIZ[step].key]}>
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={!targetKeyword || submitting}>
            {submitting ? "Generating…" : "Generate Article"}
          </Button>
        )}
      </div>
    </div>
  );
}
