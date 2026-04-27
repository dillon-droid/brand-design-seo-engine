import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CompanyForm, type CompanyFormData } from "@/components/CompanyForm";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

type Company = CompanyFormData & { id: string; createdAt: string; updatedAt: string };

export function CompaniesPage() {
  const qc = useQueryClient();
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get<Company[]>("/api/companies"),
  });

  const create = useMutation({
    mutationFn: (body: CompanyFormData) => api.post<Company>("/api/companies", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      setOpenAdd(false);
      toast({ title: "Company saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: (body: CompanyFormData & { id: string }) =>
      api.patch<Company>(`/api/companies/${body.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      setEditing(null);
      toast({ title: "Company updated" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/companies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Company deleted" });
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-foreground mb-1">My Companies</h1>
          <p className="text-sm text-muted-foreground">
            Add your clients so you can generate keywords and articles for them instantly.
          </p>
        </div>
        <Button onClick={() => setOpenAdd(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Company
        </Button>
      </div>

      {companies.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center mb-3">
              <Building2 className="w-6 h-6 text-[hsl(36_95%_57%)]" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">No companies yet.</p>
            <Button onClick={() => setOpenAdd(true)}>Add your first company</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <Card key={c.id} className="hover:border-[hsl(36_95%_57%/0.3)] transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-[hsl(36_95%_57%)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">{c.name}</div>
                    <div className="text-[11px] text-[hsl(0_0%_50%)] mt-0.5">{c.industry || "—"}</div>
                  </div>
                </div>
                {c.domain ? <div className="text-[11px] text-[hsl(0_0%_45%)] truncate mb-2">{c.domain}</div> : null}
                {c.location ? <div className="text-[11px] text-[hsl(0_0%_45%)] mb-3">{c.location}</div> : null}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete ${c.name}?`)) remove.mutate(c.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
          </DialogHeader>
          <CompanyForm onSubmit={(d) => create.mutate(d)} submitting={create.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
          </DialogHeader>
          {editing ? (
            <CompanyForm
              initial={editing}
              onSubmit={(d) => update.mutate({ ...d, id: editing.id })}
              submitting={update.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
