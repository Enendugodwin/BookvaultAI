import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BookOpenCheck,
  ChartNoAxesCombined,
  ChevronDown,
  Compass,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  PenLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { useTheme } from "@/context/theme";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/library", label: "Library", icon: LibraryBig, end: false },
  { to: "/reading", label: "Reading", icon: BookOpenCheck, end: false },
  { to: "/notes", label: "Notes", icon: NotebookPen, end: false },
] as const;

const NAV = [
  { section: "Read", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/library", label: "Library", icon: LibraryBig },
    { to: "/reading", label: "Currently reading", icon: BookOpenCheck },
    { to: "/discover", label: "Discover", icon: Compass },
  ]},
  { section: "Grow", items: [
    { to: "/goals", label: "Goals", icon: Target },
    { to: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
    { to: "/assistant", label: "AI assistant", icon: Sparkles },
  ]},
  { section: "Reflect", items: [
    { to: "/notes", label: "Notes & highlights", icon: NotebookPen },
    { to: "/journal", label: "Journal", icon: PenLine },
  ]},
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background">
        <span className="font-display text-lg font-semibold leading-none">Y</span>
      </span>
      <div>
        <p className="font-display text-[16px] font-semibold leading-none tracking-tight">YVO&apos;s Book Vault</p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">AI reading desk</p>
      </div>
    </div>
  );
}

function NavItems({ unread, isAdmin, onNavigate }: { unread: number; isAdmin: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            {group.section}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                      isActive
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground/80")} />
                      <span className="flex-1">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto space-y-0.5 border-t border-border/70 pt-3">
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )
            }
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="flex-1">Admin portal</span>
          </NavLink>
        )}
        <NavLink
          to="/notifications"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
              isActive ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
            )
          }
        >
          <Bell className="h-4 w-4" />
          <span className="flex-1">Notifications</span>
          {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </NavLink>
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
              isActive ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
            )
          }
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
      </div>
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-md border border-border/70 bg-card p-2 text-left transition-colors hover:border-foreground/20"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={user.display_name} className="h-8 w-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-4">{user.display_name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-full overflow-hidden rounded-md border border-border bg-card p-1 shadow-lift"
          >
            <button
              role="menuitem"
              onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] hover:bg-muted"
            >
              {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {resolved === "dark" ? "Light appearance" : "Dark appearance"}
            </button>
            <NavLink
              to="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] hover:bg-muted"
            >
              <Settings className="h-4 w-4" /> Settings
            </NavLink>
            <button
              role="menuitem"
              onClick={() => void logout()}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const notifications = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api.notifications.list({ unread_only: true, page_size: 1 }),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="min-h-full bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-lift">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border/80 bg-card/60 backdrop-blur lg:flex">
        <div className="flex h-16 items-center border-b border-border/60 px-5">
          <button onClick={() => navigate("/")} className="text-left">
            <Logo />
          </button>
        </div>
        <NavItems unread={unread} isAdmin={Boolean(user?.is_admin)} />
        <div className="border-t border-border/60 p-3">
          <UserMenu />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-[min(86vw,320px)] flex-col border-r border-border bg-card animate-fade-up">
            <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
              <Logo />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NavItems unread={unread} isAdmin={Boolean(user?.is_admin)} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-border/60 p-3">
              <UserMenu />
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-foreground text-background">
              <span className="font-display text-sm font-semibold">Y</span>
            </span>
            <span className="font-display text-[14px] font-semibold">YVO&apos;s Book Vault</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {user && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")} aria-label="Notifications" className="relative">
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />}
              </Button>
            )}
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-5 sm:px-6 sm:py-6 lg:px-10 lg:pb-9 lg:pt-9">
          <Outlet />
        </main>

        <footer className="mx-auto w-full max-w-[1280px] px-4 pb-8 text-[11px] text-muted-foreground/70 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-1 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p>YVO's Book Vault · your reading data stays yours.</p>
            <p className="inline-flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" /> Private workspace
            </p>
          </div>
        </footer>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={cn(
              "flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors",
              mobileOpen ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Open all navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}

export function UserAvatarFallback({ name }: { name: string }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">
      {initials(name)}
    </span>
  );
}
