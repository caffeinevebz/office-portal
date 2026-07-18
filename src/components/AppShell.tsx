"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Receipt,
  UsersRound,
  CalendarDays,
  FolderClosed,
  BellRing,
  KeyRound,
  ArrowDownUp,
  Landmark,
  Wallet,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn, initials } from "@/lib/format";
import { AuthProvider, useAuth, type AuthUser } from "@/lib/auth/context";
import { ROLE_ACCESS, type Permission } from "@/lib/auth/roles";
import { AppMark } from "@/components/LedgifyLogo";
import { SetPinModal } from "@/components/SetPinModal";
import { NotificationBell } from "@/components/NotificationBell";

const NAV: { href: string; label: string; icon: typeof Users; perm?: Permission }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/itr", label: "Filing Register", icon: Landmark },
  // The receipt register lives inside Invoices (one billing module).
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/expenses", label: "Reimbursements", icon: Wallet, perm: "raiseExpenses" },
  { href: "/staff", label: "Team", icon: UsersRound },
  { href: "/documents", label: "Documents", icon: FolderClosed },
  { href: "/inward", label: "Inward/Outward", icon: ArrowDownUp },
  { href: "/dsc", label: "DSC Register", icon: KeyRound },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/reminders", label: "Reminders", icon: BellRing },
  { href: "/access", label: "Access Control", icon: ShieldCheck, perm: "manageRoles" },
  { href: "/settings", label: "Firm Settings", icon: Settings, perm: "manageOrgs" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { can } = useAuth();
  return (
    <nav className="space-y-1 px-3">
      {NAV.filter((item) => !item.perm || can(item.perm)).map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors",
              collapsed ? "justify-center px-2" : "px-3",
              active
                ? "bg-white/10 text-white"
                : "text-brand-100/75 hover:bg-white/5 hover:text-white",
            )}
          >
            {active && (
              <span className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r bg-fern-400" />
            )}
            <Icon
              className={cn(
                "h-[18px] w-[18px] shrink-0",
                active ? "text-fern-300" : "text-brand-200/70 group-hover:text-white",
              )}
            />
            {!collapsed && label}
          </Link>
        );
      })}
    </nav>
  );
}

export type Branding = { name: string; tagline: string; hasLogo: boolean };

function Brand({
  branding,
  collapsed = false,
}: {
  branding: Branding;
  collapsed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-5",
        collapsed ? "justify-center px-2" : "px-5",
      )}
    >
      {branding.hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/api/branding/logo"
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5"
        />
      ) : (
        <AppMark className="h-9 w-9 shrink-0 rounded-lg" />
      )}
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">{branding.name}</p>
          <p className="text-[11px] text-brand-200/80">{branding.tagline}</p>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-2 hover:bg-slate-100"
      >
        <div className="hidden text-right sm:block">
          <p className="text-xs font-medium text-slate-900">{user.name}</p>
          <p className="text-[11px] text-slate-500">{user.role}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initials(user.name)}
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                <span className="font-medium text-slate-700">{user.role}</span>
                {" — "}
                {ROLE_ACCESS[user.role] ?? "Access to the portal"}
              </p>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                setPinOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <KeyRound className="h-4 w-4 text-brand-500" />
              Quick-access PIN
            </button>
            <button
              onClick={signOut}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      )}

      {pinOpen && <SetPinModal user={user} onClose={() => setPinOpen(false)} />}
    </div>
  );
}

export function AppShell({
  user,
  permissions,
  branding,
  children,
}: {
  user: AuthUser;
  permissions: string[];
  branding: Branding;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore the saved sidebar preference (client-only to avoid hydration drift).
  useEffect(() => {
    setCollapsed(localStorage.getItem("ledgify.sidebar") === "collapsed");
  }, []);

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem("ledgify.sidebar", c ? "open" : "collapsed");
      return !c;
    });
  }

  return (
    <AuthProvider user={user} permissions={permissions}>
      <div className="min-h-screen">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden flex-col bg-gradient-to-b from-brand-900 to-brand-950 transition-[width] duration-200 lg:flex",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <Brand branding={branding} collapsed={collapsed} />
          <div className="mt-1 flex-1 overflow-y-auto pb-6">
            <NavLinks collapsed={collapsed} />
          </div>
          <div
            className={cn(
              "flex items-center border-t border-white/10 py-3",
              collapsed ? "justify-center px-2" : "justify-between px-5",
            )}
          >
            {!collapsed && (
              <p className="text-[11px] text-brand-200/70">FY 2026-27 · AY 2026-27</p>
            )}
            <button
              onClick={toggleSidebar}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="rounded-lg p-1.5 text-brand-200/80 hover:bg-white/10 hover:text-white"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4.5 w-4.5" />
              ) : (
                <PanelLeftClose className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[82vw] flex-col bg-gradient-to-b from-brand-900 to-brand-950 shadow-2xl">
              <div className="flex items-center justify-between pr-3">
                <Brand branding={branding} />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-brand-200 hover:bg-white/10 hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-1 flex-1 overflow-y-auto pb-6">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </div>
            </aside>
          </div>
        )}

        {/* Content */}
        <div className={cn(collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Firm identity in the mobile top bar (sidebar is hidden there) */}
            <div className="flex items-center gap-2 lg:hidden">
              {branding.hasLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/api/branding/logo" alt="" className="h-7 w-7 rounded-md object-contain" />
              ) : (
                <AppMark className="h-7 w-7 rounded-md" />
              )}
              <span className="max-w-[46vw] truncate text-sm font-semibold text-slate-900">
                {branding.name}
              </span>
            </div>
            <div className="flex-1" />
            <NotificationBell />
            <UserMenu user={user} />
          </header>
          <main className="mx-auto max-w-7xl px-4 py-5 pb-16 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
