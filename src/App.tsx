import { Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/lib/api";

import { DashboardPage } from "@/pages/Dashboard";
import { CompaniesPage } from "@/pages/Companies";
import { CompanyDetailPage } from "@/pages/CompanyDetail";
import { KeywordsPage } from "@/pages/Keywords";
import { RankingsPage } from "@/pages/Rankings";
import { ArticlesPage } from "@/pages/Articles";
import { ArticleDetailPage } from "@/pages/ArticleDetail";
import { LoginPage } from "@/pages/Login";

type Me = { user: { id: string; email: string; name: string | null } | null };

export function App() {
  const [location, navigate] = useLocation();
  const { data, isLoading } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/api/auth/me"),
    staleTime: 60_000,
  });

  const onLogin = location === "/login";
  const authed = !!data?.user;

  useEffect(() => {
    if (isLoading) return;
    if (!authed && !onLogin) navigate("/login", { replace: true });
    if (authed && onLogin) navigate("/", { replace: true });
  }, [authed, onLogin, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  if (!authed) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userEmail={data?.user?.email} />
      <main className="flex-1 overflow-y-auto">
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/companies" component={CompaniesPage} />
          <Route path="/companies/:id">{(params) => <CompanyDetailPage id={params.id} />}</Route>
          <Route path="/keywords" component={KeywordsPage} />
          <Route path="/rankings" component={RankingsPage} />
          <Route path="/articles" component={ArticlesPage} />
          <Route path="/articles/:id">{(params) => <ArticleDetailPage id={params.id} />}</Route>
          <Route>
            <div className="p-10 text-muted-foreground">Page not found.</div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
