import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const qc = useQueryClient();

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<{ ok: true }>("/api/auth/login", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast({ title: "Sign-in failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-12 h-12 rounded-xl bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center">
            <Zap className="w-7 h-7 text-[hsl(36_95%_57%)]" fill="currentColor" />
          </div>
          <CardTitle>Brand Design SEO Engine</CardTitle>
          <CardDescription>Internal tool — team sign-in only</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate({ email, password });
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@branddesignco.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-3">
              Contact your admin to be added.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
