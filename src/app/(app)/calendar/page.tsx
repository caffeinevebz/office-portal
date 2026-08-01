"use client";

import { useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  format,
  isSameMonth,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, Landmark, Scale } from "lucide-react";
import { useResource } from "@/lib/useApi";
import type { Task } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/EmptyState";
import { cn } from "@/lib/format";

const CATEGORY_DOT: Record<string, string> = {
  "Income Tax": "bg-violet-500",
  TDS: "bg-blue-500",
  GST: "bg-brand-500",
  "MCA/ROC": "bg-amber-500",
  Audit: "bg-rose-500",
  Registration: "bg-slate-500",
  Other: "bg-slate-400",
  // legacy
  "ROC/MCA": "bg-amber-500",
  Accounting: "bg-emerald-500",
};

// The statutory calendars the app ships with, and how they are tinted.
const LAW_STYLE: Record<string, { chip: string; row: string; dot: string }> = {
  "Income Tax": {
    chip: "bg-violet-100 text-violet-800 ring-violet-200",
    row: "bg-violet-50 text-violet-900 ring-violet-200",
    dot: "bg-violet-500",
  },
  GST: {
    chip: "bg-brand-100 text-brand-800 ring-brand-200",
    row: "bg-brand-50 text-brand-900 ring-brand-200",
    dot: "bg-brand-500",
  },
  MCA: {
    chip: "bg-amber-100 text-amber-800 ring-amber-200",
    row: "bg-amber-50 text-amber-900 ring-amber-200",
    dot: "bg-amber-500",
  },
};

type StatutoryEntry = {
  key: string;
  law: string;
  category: string;
  title: string;
  occurrenceTitle: string;
  dueDate: string;
  priority: string;
  notes: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LAWS = ["Income Tax", "GST", "MCA"] as const;

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  // Which statutory calendars to paint, and whether to show firm tasks.
  const [laws, setLaws] = useState<string[]>([...LAWS]);
  const [showTasks, setShowTasks] = useState(true);
  // Only the firm's own tasks: deadlines generated from a statutory schedule
  // are already painted as statutory dates, and would otherwise list twice.
  const { data, loading } = useResource<Task[]>("/api/tasks?source=firm");

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  // Statutory due dates for exactly the grid on screen.
  const range = useMemo(
    () => ({ from: days[0]?.toISOString() ?? "", to: days[days.length - 1]?.toISOString() ?? "" }),
    [days],
  );
  const { data: statutory } = useResource<{ entries: StatutoryEntry[] }>(
    `/api/statutory-calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    if (!showTasks) return map;
    for (const t of data ?? []) {
      if (!t.dueDate) continue;
      const key = format(new Date(t.dueDate), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [data, showTasks]);

  const statutoryByDay = useMemo(() => {
    const map = new Map<string, StatutoryEntry[]>();
    for (const e of statutory?.entries ?? []) {
      if (!laws.includes(e.law)) continue;
      const key = format(new Date(e.dueDate), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [statutory, laws]);

  const monthTaskCount = (data ?? []).filter(
    (t) => t.dueDate && isSameMonth(new Date(t.dueDate), cursor),
  ).length;
  const monthStatutoryCount = (statutory?.entries ?? []).filter(
    (e) => laws.includes(e.law) && isSameMonth(new Date(e.dueDate), cursor),
  ).length;

  const toggleLaw = (law: string) =>
    setLaws((ls) => (ls.includes(law) ? ls.filter((l) => l !== law) : [...ls, law]));

  // The month's statutory dates, listed under the grid for quick reading.
  const monthStatutory = (statutory?.entries ?? [])
    .filter((e) => laws.includes(e.law) && isSameMonth(new Date(e.dueDate), cursor))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div>
      <PageHeader
        title="Compliance Calendar"
        subtitle="Statutory due dates under the Income-tax Act, GST law and the Companies Act, alongside the firm's own deadlines"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-sm">
              <button
                onClick={() => setCursor((c) => addMonths(c, -1))}
                className="rounded-l-lg p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCursor((c) => addMonths(c, 1))}
                className="rounded-r-lg border-l border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        }
      />

      {/* Which calendars are painted */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Scale className="h-3.5 w-3.5" /> Statutory calendars
          </span>
          {LAWS.map((law) => {
            const on = laws.includes(law);
            return (
              <button
                key={law}
                onClick={() => toggleLaw(law)}
                aria-pressed={on}
                data-testid={`law-chip-${law}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                  on
                    ? LAW_STYLE[law].chip
                    : "bg-white text-slate-400 ring-slate-200 hover:text-slate-600",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", on ? LAW_STYLE[law].dot : "bg-slate-300")} />
                {law === "MCA" ? "MCA / ROC" : law}
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <button
            onClick={() => setShowTasks((s) => !s)}
            aria-pressed={showTasks}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
              showTasks
                ? "bg-slate-100 text-slate-700 ring-slate-300"
                : "bg-white text-slate-400 ring-slate-200 hover:text-slate-600",
            )}
          >
            <Landmark className="h-3.5 w-3.5" /> Firm tasks
          </button>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{format(cursor, "MMMM yyyy")}</h2>
        <p className="text-sm text-slate-500">
          {monthStatutoryCount} statutory due date(s) · {monthTaskCount} firm deadline(s)
        </p>
      </div>

      <Card className="overflow-hidden">
        {loading && !data ? (
          <Loading label="Loading calendar…" />
        ) : (
          <>
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-medium text-slate-500">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const tasks = byDay.get(key) ?? [];
                const stat = statutoryByDay.get(key) ?? [];
                const inMonth = isSameMonth(day, cursor);
                const today = isToday(day);
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-28 border-r border-b border-slate-100 p-1.5 align-top",
                      !inMonth && "bg-slate-50/60",
                    )}
                  >
                    <div className="mb-1 flex justify-end">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          today
                            ? "bg-brand-600 font-semibold text-white"
                            : inMonth
                              ? "text-slate-600"
                              : "text-slate-300",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {/* Statutory dates first — they are the same for everyone */}
                      {stat.slice(0, 2).map((e) => (
                        <div
                          key={`${e.key}-${key}`}
                          title={`${e.law}: ${e.title}\n${e.notes}`}
                          className={cn(
                            "flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            LAW_STYLE[e.law]?.row ?? "bg-slate-50 text-slate-700 ring-slate-200",
                          )}
                        >
                          <span className="truncate">{e.title}</span>
                        </div>
                      ))}
                      {stat.length > 2 && (
                        <p className="pl-1 text-[11px] text-slate-400">
                          +{stat.length - 2} statutory
                        </p>
                      )}
                      {tasks.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          title={`${t.title}${t.client ? " · " + t.client.name : ""}`}
                          className={cn(
                            "flex items-center gap-1 rounded px-1 py-0.5 text-[11px]",
                            t.status === "Completed"
                              ? "bg-slate-50 text-slate-400 line-through"
                              : "bg-slate-50 text-slate-700",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              CATEGORY_DOT[t.category] ?? "bg-slate-400",
                            )}
                          />
                          <span className="truncate">{t.title}</span>
                        </div>
                      ))}
                      {tasks.length > 2 && (
                        <p className="pl-1 text-[11px] text-slate-400">+{tasks.length - 2} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* This month's statutory dates, spelled out */}
      {monthStatutory.length > 0 && (
        <Card className="mt-4">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-800">
              Statutory due dates — {format(cursor, "MMMM yyyy")}
            </h3>
            <p className="text-xs text-slate-500">
              As prescribed under the Income-tax Act, the GST law and the Companies Act.
            </p>
          </div>
          <ul className="divide-y divide-slate-50" data-testid="statutory-list">
            {monthStatutory.map((e) => (
              <li key={`${e.key}-${e.dueDate}`} data-testid="statutory-row" className="flex items-start gap-3 px-4 py-2.5">
                <span className="w-12 shrink-0 text-center">
                  <span className="block text-sm font-semibold text-slate-800">
                    {format(new Date(e.dueDate), "d")}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {format(new Date(e.dueDate), "MMM")}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{e.title}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                        LAW_STYLE[e.law]?.chip ?? "bg-slate-100 text-slate-600 ring-slate-200",
                      )}
                    >
                      {e.law === "MCA" ? "MCA / ROC" : e.law}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{e.notes}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Legend for the firm's own task categories */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {Object.entries(CATEGORY_DOT).map(([cat, color]) => (
          <span key={cat} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cn("h-2 w-2 rounded-full", color)} /> {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
