"use client";

import Link from "next/link";
import {
  Users,
  ClipboardList,
  AlertTriangle,
  IndianRupee,
  ChevronRight,
  CircleDot,
} from "lucide-react";
import { useResource } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/EmptyState";
import { RevenueChart, StatusDonut } from "@/components/charts";
import {
  formatCurrency,
  formatDate,
  dueLabel,
  daysUntil,
  cn,
} from "@/lib/format";
import { CATEGORY_TONE } from "@/lib/constants";

type Dashboard = {
  kpis: {
    activeClients: number;
    totalClients: number;
    openTasks: number;
    overdueTasks: number;
    dueSoon: number;
    outstanding: number;
    collected: number;
    overdueInvoices: number;
  };
  statusBreakdown: { status: string; count: number }[];
  categoryBreakdown: { category: string; count: number }[];
  months: { label: string; billed: number; collected: number }[];
  upcoming: {
    id: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    dueDate: string | null;
    client: string | null;
    assignee: string | null;
  }[];
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error } = useResource<Dashboard>("/api/dashboard");
  const firstName =
    user?.name.replace(/^CA\s+/, "").split(" ")[0] ?? "there";

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error || !data)
    return <p className="text-sm text-rose-600">Failed to load: {error}</p>;

  const { kpis } = data;
  const maxCat = Math.max(1, ...data.categoryBreakdown.map((c) => c.count));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Welcome back, {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here&apos;s what needs your firm&apos;s attention today · {formatDate(new Date())}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Clients"
          value={kpis.activeClients}
          hint={`${kpis.totalClients} total on record`}
          icon={Users}
          accent="indigo"
        />
        <StatCard
          label="Open Compliance Tasks"
          value={kpis.openTasks}
          hint={`${kpis.dueSoon} due within 7 days`}
          icon={ClipboardList}
          accent="blue"
        />
        <StatCard
          label="Overdue Deadlines"
          value={kpis.overdueTasks}
          hint={
            kpis.overdueTasks > 0 ? "Needs immediate action" : "All on schedule"
          }
          icon={AlertTriangle}
          accent={kpis.overdueTasks > 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="Outstanding Receivables"
          value={formatCurrency(kpis.outstanding)}
          hint={`${kpis.overdueInvoices} invoice(s) overdue`}
          icon={IndianRupee}
          accent="amber"
        />
      </div>

      {/* Charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Billing & Collections"
            subtitle="Billed vs. collected over the last 6 months"
          />
          <div className="p-4">
            <RevenueChart data={data.months} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Task Status" subtitle="Across all compliance work" />
          <div className="p-4">
            <StatusDonut data={data.statusBreakdown} />
          </div>
        </Card>
      </div>

      {/* Deadlines + category mix */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Upcoming Deadlines"
            subtitle="Next compliance dates across clients"
            action={
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <ul className="divide-y divide-slate-100">
            {data.upcoming.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-slate-400">
                No upcoming deadlines 🎉
              </li>
            )}
            {data.upcoming.map((t) => {
              const overdue = (daysUntil(t.dueDate) ?? 0) < 0;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {t.title}
                      </p>
                      <Badge tone={CATEGORY_TONE[t.category]}>{t.category}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {t.client ?? "Internal"}
                      {t.assignee ? ` · ${t.assignee}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-xs font-medium",
                        overdue ? "text-rose-600" : "text-slate-700",
                      )}
                    >
                      {dueLabel(t.dueDate)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(t.dueDate)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Compliance Mix" subtitle="Open tasks by category" />
          <div className="space-y-3 p-5">
            {data.categoryBreakdown.length === 0 && (
              <p className="text-sm text-slate-400">No open tasks.</p>
            )}
            {data.categoryBreakdown.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <CircleDot className="h-3 w-3 text-brand-400" />
                    {c.category}
                  </span>
                  <span className="font-medium text-slate-700">{c.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(c.count / maxCat) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
