"use client";

import { useMemo, useState } from "react";
import {
  Search,
  NotebookPen,
  Printer,
  HelpCircle,
  FileText,
  MessageSquareReply,
  ClipboardList,
} from "lucide-react";
import { useResource, useDebounced } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { AuditEngagement } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { AuditNotesModal } from "@/components/AuditNotes";
import { PdfViewer } from "@/components/PdfViewer";
import { formatDate, cn } from "@/lib/format";

// Audit notes, reachable without going through the task register first.
//
// The working paper always lived on the audit task, which meant finding the
// task before you could write a note — fine once, tiresome every morning of an
// audit. This lists the engagements themselves, the ones with points sitting
// with the client at the top, and opens the same panel in one press.

type Lens = "All" | "Awaiting the client" | "Being written up" | "Not started";
const LENSES: Lens[] = ["All", "Awaiting the client", "Being written up", "Not started"];

const matchesLens = (e: AuditEngagement, lens: Lens) => {
  if (lens === "Awaiting the client") return e.counts.queried > 0;
  if (lens === "Being written up") return e.counts.notes > 0 && e.counts.queried === 0;
  if (lens === "Not started") return e.counts.notes === 0;
  return true;
};

export default function AuditNotesPage() {
  const { can } = useAuth();
  const canManage = can("manageTasks");

  const [q, setQ] = useState("");
  const qd = useDebounced(q);
  const [fy, setFy] = useState("All");
  const [lens, setLens] = useState<Lens>("All");
  const { data, loading, error, refresh } = useResource<AuditEngagement[]>(
    `/api/audit-notes?q=${encodeURIComponent(qd)}&fy=${encodeURIComponent(fy)}`,
  );

  // Which working paper is open is held as an id and read out of the address,
  // so /audit-notes?task=<id> opens straight onto one — a link worth keeping
  // for the engagement somebody is living in this week.
  const [openId, setOpenId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("task"),
  );
  const [viewing, setViewing] = useState<AuditEngagement | null>(null);

  const rows = useMemo(() => data ?? [], [data]);
  const years = useMemo(
    () => [...new Set(rows.map((r) => r.financialYear).filter(Boolean))].sort().reverse() as string[],
    [rows],
  );
  const shown = rows.filter((e) => matchesLens(e, lens));

  const openFor = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  /** Open (or close) a working paper, keeping the address bar in step. */
  const show = (e: AuditEngagement | null) => {
    setOpenId(e?.id ?? null);
    const url = new URL(window.location.href);
    if (e) url.searchParams.set("task", e.id);
    else url.searchParams.delete("task");
    window.history.replaceState(null, "", url.toString());
  };

  const totals = rows.reduce(
    (t, e) => ({
      withNotes: t.withNotes + (e.counts.notes > 0 ? 1 : 0),
      needing: t.needing + e.counts.needsClarification,
      queried: t.queried + e.counts.queried,
      letters: t.letters + e.counts.letters,
    }),
    { withNotes: 0, needing: 0, queried: 0, letters: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Audit Notes"
        subtitle="Working papers across every audit — vouching observations, ledger scrutiny and the query letters raised from them"
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Engagements with notes"
          value={`${totals.withNotes} of ${rows.length}`}
          icon={NotebookPen}
          accent="indigo"
        />
        <StatCard
          label="Points needing clarification"
          value={totals.needing}
          icon={HelpCircle}
          accent={totals.needing > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Awaiting the client"
          value={totals.queried}
          icon={MessageSquareReply}
          accent={totals.queried > 0 ? "rose" : "emerald"}
          hint={totals.queried > 0 ? "Asked and not yet answered" : "Nothing outstanding"}
        />
        <StatCard label="Query letters issued" value={totals.letters} icon={FileText} accent="fern" />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by client or engagement…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {LENSES.map((l) => (
              <button
                key={l}
                onClick={() => setLens(l)}
                aria-pressed={lens === l}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
                  lens === l
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {l}
                <span className={cn("ml-1.5", lens === l ? "text-brand-100" : "text-slate-400")}>
                  {rows.filter((e) => matchesLens(e, l)).length}
                </span>
              </button>
            ))}
            {years.length > 0 && (
              <select
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white py-1.5 pr-8 pl-3 text-xs shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                <option value="All">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    FY {y}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {loading && !data ? (
        <Loading label="Gathering the working papers…" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={rows.length === 0 ? "No audit engagements yet" : "Nothing under this filter"}
          message={
            rows.length === 0
              ? "Raise a task under the Audit category and its working paper appears here."
              : "Try another filter, or search for the client."
          }
        />
      ) : (
        <div className="space-y-2">
          {shown.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button
                  onClick={() => show(e)}
                  className="min-w-0 flex-1 text-left"
                  title="Open the working paper"
                >
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {e.client?.name ?? "No client linked"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {[e.title, e.financialYear && !e.title.includes(e.financialYear) ? `FY ${e.financialYear}` : null]
                      .filter(Boolean)
                      .join("  ·  ")}
                    {e.assignee ? `  ·  ${e.assignee.name}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {e.counts.notes === 0 ? (
                      <Badge tone="slate">No notes yet</Badge>
                    ) : (
                      <>
                        <Badge tone="indigo">
                          {e.counts.notes} note{e.counts.notes === 1 ? "" : "s"}
                        </Badge>
                        <span className="text-[11px] text-slate-400">
                          {e.counts.vouching} vouching · {e.counts.scrutiny} scrutiny
                        </span>
                      </>
                    )}
                    {e.counts.queried > 0 && (
                      <Badge tone="amber">{e.counts.queried} awaiting the client</Badge>
                    )}
                    {e.counts.answered > 0 && <Badge tone="blue">{e.counts.answered} answered</Badge>}
                    {e.counts.letters > 0 && (
                      <Badge tone="green">
                        {e.counts.letters} letter{e.counts.letters === 1 ? "" : "s"}
                      </Badge>
                    )}
                    {e.lastNoteAt && (
                      <span className="text-[11px] text-slate-400">
                        last noted {formatDate(e.lastNoteAt)}
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  {e.counts.notes > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setViewing(e)}
                      title="Open the working paper as a PDF"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print
                    </Button>
                  )}
                  <Button size="sm" onClick={() => show(e)}>
                    <NotebookPen className="h-3.5 w-3.5" />
                    {e.counts.notes > 0 ? "Open notes" : "Start notes"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {openFor && (
        <AuditNotesModal
          task={openFor}
          canManage={canManage}
          onClose={() => show(null)}
          onChanged={refresh}
        />
      )}

      {viewing && (
        <PdfViewer
          src={`/api/tasks/${viewing.id}/observations/pdf`}
          title={`Audit observations — ${viewing.title}`}
          filename={`Audit-observations-${(viewing.client?.name ?? viewing.title)
            .replace(/[^\w\s.-]/g, "")
            .replace(/\s+/g, "-")}.pdf`}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
