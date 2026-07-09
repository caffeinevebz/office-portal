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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useResource } from "@/lib/useApi";
import type { Task } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/EmptyState";
import { cn } from "@/lib/format";

const CATEGORY_DOT: Record<string, string> = {
  GST: "bg-indigo-500",
  "Income Tax": "bg-violet-500",
  TDS: "bg-blue-500",
  "ROC/MCA": "bg-amber-500",
  Audit: "bg-rose-500",
  Accounting: "bg-emerald-500",
  Registration: "bg-slate-500",
  Other: "bg-slate-400",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const { data, loading } = useResource<Task[]>("/api/tasks");

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of data ?? []) {
      if (!t.dueDate) continue;
      const key = format(new Date(t.dueDate), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const monthTaskCount = (data ?? []).filter(
    (t) => t.dueDate && isSameMonth(new Date(t.dueDate), cursor),
  ).length;

  return (
    <div>
      <PageHeader
        title="Compliance Calendar"
        subtitle="Statutory due dates across all clients"
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {format(cursor, "MMMM yyyy")}
        </h2>
        <p className="text-sm text-slate-500">{monthTaskCount} deadline(s) this month</p>
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
                const inMonth = isSameMonth(day, cursor);
                const today = isToday(day);
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-24 border-b border-r border-slate-100 p-1.5 align-top",
                      !inMonth && "bg-slate-50/60",
                    )}
                  >
                    <div className="mb-1 flex justify-end">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          today
                            ? "bg-indigo-600 font-semibold text-white"
                            : inMonth
                              ? "text-slate-600"
                              : "text-slate-300",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {tasks.slice(0, 3).map((t) => (
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
                      {tasks.length > 3 && (
                        <p className="pl-1 text-[11px] text-slate-400">
                          +{tasks.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Legend */}
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
