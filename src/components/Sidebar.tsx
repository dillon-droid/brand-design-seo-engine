import { Link, useLocation } from "wouter";
import { Building2, ChartColumn, FileText, LayoutDashboard, Search, Zap, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/keywords", label: "Keywords", icon: Search },
  { href: "/rankings", label: "Rankings", icon: ChartColumn },
  { href: "/articles", label: "Articles", icon: FileText },
];

export function Sidebar({ userEmail }: { userEmail?: string | null }) {
  const [location] = useLocation();
  const qc = useQueryClient();

  const logout = useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => {
      qc.clear();
      window.location.href = "/login";
    },
  });

  return (
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg bg-[hsl(36_95%_57%/0.12)] flex items-center justify-center">
            <Zap className="w-5 h-5 text-[hsl(36_95%_57%)]" fill="currentColor" />
          </div>
          <div>
            <div className="text-sm font-extrabold font-display leading-tight">Brand Design</div>
            <div className="text-[10px] uppercase tracking-widest text-[hsl(0_0%_45%)]">SEO Engine</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-[hsl(36_95%_57%/0.12)] text-[hsl(36_95%_57%)]"
                  : "text-[hsl(0_0%_60%)] hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {userEmail ? (
        <div className="border-t border-sidebar-border px-3 py-3 space-y-1">
          <div className="px-3 py-1.5 text-[11px] text-[hsl(0_0%_50%)] truncate">{userEmail}</div>
          <button
            onClick={() => logout.mutate()}
            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold text-[hsl(0_0%_55%)] hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </aside>
  );
}
