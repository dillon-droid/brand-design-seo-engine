import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

// Curated to Brand Design Co.'s actual client mix.
// Most-used categories are listed first; "Used in your companies" is prepended dynamically.
export const INDUSTRIES = [
  // BD Co. specialties
  "Real Estate",
  "Real Estate — Cash House Buyer",
  "Real Estate — Investor / Wholesaler",
  "Property Management",
  "Home Services",
  "Roofing & Building Supply",
  "Landscaping & Outdoor",
  "Construction",
  "Marketing Agency / Digital Marketing",
  "Business Coaching & Consulting",
  "Tax & Accounting",
  "Financial Services",
  // General industries we sometimes serve
  "E-Commerce",
  "SaaS / Tech",
  "Healthcare",
  "Legal Services",
  "Insurance",
  "Education",
  "Restaurant & Food",
  "Fitness & Wellness",
  "Beauty & Salon",
  "Automotive",
  "Other",
];

export function IndustrySelect({
  value,
  onValueChange,
  placeholder = "Select industry…",
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { data: companies = [] } = useQuery<Array<{ industry: string }>>({
    queryKey: ["companies"],
    queryFn: () => api.get("/api/companies"),
  });

  const inUse = Array.from(
    new Set(
      companies
        .map((c) => c.industry)
        .filter((i): i is string => Boolean(i && i.trim())),
    ),
  ).sort();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {inUse.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Used in your companies</SelectLabel>
            {inUse.map((i) => (
              <SelectItem key={`used-${i}`} value={i}>{i}</SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        <SelectGroup>
          <SelectLabel>{inUse.length > 0 ? "All industries" : ""}</SelectLabel>
          {INDUSTRIES.filter((i) => !inUse.includes(i)).map((i) => (
            <SelectItem key={i} value={i}>{i}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export type CompanyFormData = {
  id?: string;
  name: string;
  industry: string;
  location: string;
  domain: string;
  description: string;
  services: string;
  targetAudience: string;
  brandVoice: string;
  toneNotes: string;
  brandScript: string;
  sbHero: string;
  sbExternalProblem: string;
  sbInternalProblem: string;
  sbGuide: string;
  sbPlan: string;
  sbCta: string;
  sbSuccessVision: string;
  sbFailureStakes: string;
  sbBrandVoice: string;
};

const empty: CompanyFormData = {
  name: "",
  industry: "",
  location: "",
  domain: "",
  description: "",
  services: "",
  targetAudience: "",
  brandVoice: "",
  toneNotes: "",
  brandScript: "",
  sbHero: "",
  sbExternalProblem: "",
  sbInternalProblem: "",
  sbGuide: "",
  sbPlan: "",
  sbCta: "",
  sbSuccessVision: "",
  sbFailureStakes: "",
  sbBrandVoice: "",
};

export function CompanyForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Partial<CompanyFormData>;
  onSubmit: (data: CompanyFormData) => void;
  submitting?: boolean;
}) {
  const [data, setData] = useState<CompanyFormData>({ ...empty, ...initial });
  const set = <K extends keyof CompanyFormData>(k: K, v: CompanyFormData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(data);
      }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Company Name</Label>
          <Input value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Brand Design Co." required />
        </div>
        <div>
          <Label>Industry</Label>
          <IndustrySelect value={data.industry} onValueChange={(v) => set("industry", v)} />
        </div>
        <div>
          <Label>Location</Label>
          <Input value={data.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Detroit, MI" />
        </div>
        <div>
          <Label>Website Domain</Label>
          <Input value={data.domain} onChange={(e) => set("domain", e.target.value)} placeholder="e.g. branddesignco.com" />
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          value={data.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Brief description of the business, what they sell, who they serve…"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Core Services</Label>
          <Textarea value={data.services} onChange={(e) => set("services", e.target.value)} placeholder="Add a service or product…" rows={3} />
        </div>
        <div>
          <Label>Target Audience</Label>
          <Textarea value={data.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder="Who do they serve?" rows={3} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Brand Voice Notes</Label>
          <Textarea value={data.brandVoice} onChange={(e) => set("brandVoice", e.target.value)} placeholder="Tone, style, words to use or avoid…" rows={3} />
        </div>
        <div>
          <Label>Internal Notes</Label>
          <Textarea value={data.toneNotes} onChange={(e) => set("toneNotes", e.target.value)} placeholder="Anything else to remember about this client…" rows={3} />
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-[hsl(36_95%_57%)] mb-3">StoryBrand BrandScript</h3>
        <Tabs defaultValue="paste">
          <TabsList>
            <TabsTrigger value="paste">Paste full BrandScript</TabsTrigger>
            <TabsTrigger value="fields">Individual fields</TabsTrigger>
          </TabsList>
          <TabsContent value="paste">
            <Label>Full BrandScript</Label>
            <Textarea
              value={data.brandScript}
              onChange={(e) => set("brandScript", e.target.value)}
              placeholder="Paste the full StoryBrand BrandScript here…"
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">Optional — paste a full BrandScript if you have one.</p>
          </TabsContent>
          <TabsContent value="fields">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>The Hero (Customer)</Label>
                <Textarea value={data.sbHero} onChange={(e) => set("sbHero", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>External Problem</Label>
                <Textarea value={data.sbExternalProblem} onChange={(e) => set("sbExternalProblem", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Internal Problem</Label>
                <Textarea value={data.sbInternalProblem} onChange={(e) => set("sbInternalProblem", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Guide Positioning</Label>
                <Textarea value={data.sbGuide} onChange={(e) => set("sbGuide", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Plan</Label>
                <Textarea value={data.sbPlan} onChange={(e) => set("sbPlan", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Direct CTA</Label>
                <Textarea value={data.sbCta} onChange={(e) => set("sbCta", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Success Vision</Label>
                <Textarea value={data.sbSuccessVision} onChange={(e) => set("sbSuccessVision", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Failure Stakes</Label>
                <Textarea value={data.sbFailureStakes} onChange={(e) => set("sbFailureStakes", e.target.value)} rows={2} />
              </div>
              <div className="md:col-span-2">
                <Label>Brand Voice</Label>
                <Textarea value={data.sbBrandVoice} onChange={(e) => set("sbBrandVoice", e.target.value)} rows={2} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial?.id ? "Update Company" : "Save Company"}
        </Button>
      </div>
    </form>
  );
}
