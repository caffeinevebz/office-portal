"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Receipt,
  UsersRound,
  CalendarDays,
  CalendarClock,
  FolderClosed,
  Building2,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { cn, initials } from "@/lib/format";
import { AuthProvider, type AuthUser } from "@/lib/auth/context";
import { ROLE_ACCESS } from "@/lib/auth/roles";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Compliance", icon: ClipboardList },
  { href: "/schedules", label: "Recurring", icon: CalendarClock },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/staff", label: "Team", icon: UsersRound },
  { href: "/documents", label: "Documents", icon: FolderClosed },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-300 hover:bg-slate-800 hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "h-[18px] w-[18px]",
                active ? "text-white" : "text-slate-400 group-hover:text-white",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
        <Building2 className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">Sharma &amp; Associates</p>
        <p className="text-[11px] text-slate-400">Chartered Accountants</p>
      </div>
    </div>
  );
}

function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
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
    </div>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AuthProvider user={user}>
      <div className="min-h-screen">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800 bg-slate-900 lg:flex">
          <Brand />
          <div className="mt-1 flex-1 overflow-y-auto pb-6">
            <NavLinks />
          </div>
          <div className="border-t border-slate-800 px-5 py-4">
            <p className="text-[11px] text-slate-500">FY 2026-27 · AY 2026-27</p>
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/50"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
              <div className="flex items-center justify-between pr-3">
                <Brand />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
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
        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex-1" />
            <UserMenu user={user} />
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
