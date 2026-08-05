"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
  Repeat,
  FileCheck2,
  ListChecks,
  Receipt,
  ShieldCheck,
  HelpCircle,
  Landmark,
  X,
} from "lucide-react";
import { useResource, useDebounced, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type {
  Task,
  Client,
  ClientGroup,
  ComplianceSchedule,
  Staff,
  ChecklistItem,
  TaskQuery,
} from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { RecurringPanel, AddRecurringButton } from "@/components/RecurringPanel";
import { TaskQueriesModal } from "@/components/TaskQueries";
import { ChecklistEditor } from "@/components/ChecklistEditor";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CATEGORY_TONE,
  PRIORITY_TONE,
  SCHEDULE_FREQUENCIES,
  MONTHS,
  QUARTERS,
  QUARTER_LABELS,
  INCOME_TAX_TASK_TYPES,
  AUDIT_SUBCATEGORIES,
  TDS_RETURN_FORMS,
  TDS_RETURN_NATURE,
  tdsFormLabel,
  GST_RETURN_TYPES,
  GST_RETURN_LABELS,
  GST_PERIODIC_RETURNS,
  GST_PERIODICITY,
  incomeTaxYearLabel,
  taxPeriodOption,
  defaultChecklist,
  checklistStatus,
  financialYears,
  canApproveRole,
  priorityFromDueDate,
  gstRegLabel,
} from "@/lib/constants";
import { dueLabel, daysUntil, toDateInput, formatDate, cn } from "@/lib/format";

// Categories whose tasks are completed by recording a return-filing entry.
const RETURN_CATEGORIES = ["GST", "Income Tax", "TDS"];

// Recent financial years for period pickers: next FY down to six years back.
function fyOptions(): string[] {
  const now = new Date();
  const start = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 8 }, (_, i) => {
    const s = start + 1 - i;
    return `${s}-${String(s + 1).slice(2)}`;
  });
}

// Short descriptors shown under a task title (form / return type / period …).
function taskMeta(t: Task): string[] {
  const bits: string[] = [];
  if (t.taskType) bits.push(t.taskType);
  if (t.tdsForm) bits.push(tdsFormLabel(t.tdsForm));
  if (t.returnNature) bits.push(t.returnNature);
  if (t.gstReturnType) bits.push(t.gstReturnType);
  if (t.gstin) bits.push(`GSTIN ${t.gstin}`);
  if (t.gstPeriodicity) bits.push(t.gstPeriodicity);
  if (t.periodQuarter) bits.push(t.periodQuarter);
  if (t.periodMonth) bits.push(MONTHS[t.periodMonth - 1]);
  if (t.financialYear) {
    // AY/TY nomenclature applies to income-tax & TDS; GST etc. use plain FY.
    const taxYear = t.category === "Income Tax" || t.category === "TDS";
    bits.push(taxYear ? `${incomeTaxYearLabel(t.financialYear)} · FY ${t.financialYear}` : `FY ${t.financialYear}`);
  }
  return bits;
}

// The team members a task is assigned to (multi), else the single assignee.
function assigneeNames(t: Task): string {
  const names =
    t.assignees && t.assignees.length ? t.assignees.map((a) => a.name) : t.assignee ? [t.assignee.name] : [];
  return names.join(", ");
}

function checklistDone(list: ChecklistItem[] | null | undefined) {
  if (!list || list.length === 0) return null;
  return { done: list.filter((i) => i.done).length, total: list.length };
}

type FormState = Partial<Task>;
// The register is split three ways so one list never mixes concerns: work the
// firm raised, deadlines the statutory calendars generated, and the recurring
// definitions themselves.
type Tab = "tasks" | "statutory" | "recurring";

export default function TasksPage() {
  const { can, user } = useAuth();
  const canManage = can("manageTasks");
  const canDelete = can("deleteTasks");
  const canRecur = can("manageSchedules");
  // Staff-level members see only tasks assigned to them (server-enforced).
  const seeAll = can("viewAllTasks");
  // A Partner/Admin can approve any task; the named approver can approve theirs.
  const canApproveTask = (t: Task) =>
    canManage && (canApproveRole(user?.role) || t.approverId === user?.id);

  const [tab, setTab] = useState<Tab>("tasks");
  // Active (in-progress) vs Completed list — completed tasks move out of the
  // working list to keep it uncluttered.
  const [view, setView] = useState<"Active" | "Completed">("Active");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
  const [assignee, setAssignee] = useState("All");
  const [fy, setFy] = useState("All");
  // Filter the register by client group ("None" = ungrouped clients).
  const [group, setGroup] = useState("All");
  const fys = financialYears(new Date(), 6);

  const qd = useDebounced(q);
  // The service-type filter is applied in the browser so the chips can show a
  // live count per service without a round trip for every click.
  const source = tab === "statutory" ? "statutory" : "firm";
  const url =
    `/api/tasks?view=${view}&q=${encodeURIComponent(qd)}&status=${status}` +
    `&source=${source}&assigneeId=${assignee}&fy=${encodeURIComponent(fy)}` +
    `&groupId=${encodeURIComponent(group)}`;
  const { data, loading, error, refresh, setData } = useResource<Task[]>(url);

  // Tasks per service type, for the chip counts — over the whole (unfiltered
  // by category) list, so every chip shows its true size.
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of data ?? []) map[t.category] = (map[t.category] ?? 0) + 1;
    return map;
  }, [data]);
  const rows = (data ?? []).filter((t) => category === "All" || t.category === category);

  // Apply a PATCH result to the list in place — no full refetch per click.
  // A task whose status leaves the current view (e.g. completed while looking
  // at In Progress) drops out of the list immediately.
  function applyTaskUpdate(updated: Task) {
    setData((list) => {
      if (!list) return list;
      const stays =
        view === "Completed" ? updated.status === "Completed" : updated.status !== "Completed";
      return stays
        ? list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
        : list.filter((t) => t.id !== updated.id);
    });
  }
  const { data: clients } = useResource<Client[]>("/api/clients?slim=1");
  const { data: staff } = useResource<Staff[]>("/api/staff");
  const { data: groups } = useResource<ClientGroup[]>("/api/client-groups");
  const { data: schedules, refresh: refreshSchedules } =
    useResource<ComplianceSchedule[]>("/api/schedules");
  // The Statutory tab only earns its place once a government calendar has
  // been synced — a firm that never syncs one never sees the tab.
  const hasStatutory = (schedules ?? []).some((s) => !!s.source);
  useEffect(() => {
    // The tab can disappear under you — e.g. the last synced obligation is
    // deleted while you are looking at it.
    if (tab === "statutory" && schedules && !hasStatutory) setTab("tasks");
  }, [tab, schedules, hasStatutory]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [filingFor, setFilingFor] = useState<Task | null>(null);
  const [addRecurring, setAddRecurring] = useState(0);
  // Task whose checklist is expanded inline in the table.
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);
  // Task whose client-clarification points are open in the modal.
  const [openQueries, setOpenQueries] = useState<string | null>(null);

  // Keep a task's clarification points in the list without a full refetch.
  function applyQueries(taskId: string, queries: TaskQuery[]) {
    setData((list) => (list ? list.map((t) => (t.id === taskId ? { ...t, queries } : t)) : list));
  }

  // Resolved from the live list so newly added points show immediately.
  const queriesFor = (data ?? []).find((t) => t.id === openQueries) ?? null;

  async function quickStatus(t: Task, newStatus: string) {
    const updated = (await apiMutate(`/api/tasks/${t.id}`, "PATCH", { status: newStatus })) as Task;
    applyTaskUpdate(updated);
  }

  async function approveTask(t: Task) {
    const updated = (await apiMutate(`/api/tasks/${t.id}`, "PATCH", { approve: true })) as Task;
    applyTaskUpdate(updated);
  }

  // Tick/untick a step from the table — the task status auto-updates from
  // the steps checked (none → Pending, some → In Progress, all → Completed).
  // The step flips locally at once; the server response then settles the row.
  async function toggleStep(t: Task, index: number) {
    const items = (t.checklist ?? []).map((it, i) =>
      i === index ? { ...it, done: !it.done } : it,
    );
    setData((list) =>
      list ? list.map((x) => (x.id === t.id ? { ...x, checklist: items } : x)) : list,
    );
    const updated = (await apiMutate(`/api/tasks/${t.id}`, "PATCH", { checklist: items })) as Task;
    applyTaskUpdate(updated);
  }

  const headerAction = !canManage
    ? undefined
    : tab === "tasks" ? (
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Task
        </Button>
      ) : tab === "recurring" && canRecur ? (
        <AddRecurringButton onClick={() => setAddRecurring((n) => n + 1)} />
      ) : undefined;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={
          !seeAll
            ? "Your work — tasks where you are an assignee or the approver"
            : tab === "statutory"
              ? "Dates pulled in from the Income Tax, GST and MCA/ROC calendars"
              : tab === "recurring"
                ? "Set up work that repeats — its tasks are then created for you and appear under Tasks"
                : "Everything the firm has to do — raised by hand, or generated from a recurring obligation"
        }
        actions={headerAction}
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={ClipboardList}>
          Tasks
        </TabButton>
        {hasStatutory && (
          <TabButton active={tab === "statutory"} onClick={() => setTab("statutory")} icon={Landmark}>
            Statutory
          </TabButton>
        )}
        <TabButton active={tab === "recurring"} onClick={() => setTab("recurring")} icon={Repeat}>
          Recurring
        </TabButton>
      </div>

      {tab === "recurring" ? (
        <RecurringPanel
          addSignal={addRecurring}
          // Setting up, generating or syncing on the Recurring tab creates
          // tasks and obligations right there. This page's lists stay mounted
          // behind it, so they have to be told — otherwise you switch back to
          // Tasks and the work you just generated is nowhere to be seen.
          onChanged={() => {
            refresh();
            refreshSchedules();
          }}
        />
      ) : (
        <>
          {tab === "statutory" && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-fern-200 bg-fern-50/60 px-4 py-3 text-sm text-fern-800">
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-fern-600" />
              <p>
                These are the government&apos;s own due dates, synced from a statutory calendar — the
                whole calendar for every client, so they are kept out of the working list. Your own
                recurring obligations are not here; their tasks appear under <strong>Tasks</strong>.
                Manage both from the{" "}
                <button
                  onClick={() => setTab("recurring")}
                  className="font-medium underline underline-offset-2 hover:text-fern-900"
                >
                  Recurring
                </button>{" "}
                tab.
              </p>
            </div>
          )}

          <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <ViewButton active={view === "Active"} onClick={() => setView("Active")}>
              In Progress
            </ViewButton>
            <ViewButton active={view === "Completed"} onClick={() => setView("Completed")}>
              <FileCheck2 className="h-3.5 w-3.5" /> Completed
            </ViewButton>
          </div>

          <Card className="mb-4">
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search task or client…"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </div>
              {view === "Active" && (
                <FilterSelect value={status} onChange={setStatus} label="status" options={TASK_STATUSES} />
              )}
              <select
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                <option value="All">All financial years</option>
                {fys.map((y) => (
                  <option key={y} value={y}>
                    FY {y}
                  </option>
                ))}
              </select>
              {(groups?.length ?? 0) > 0 && (
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                  title="Filter tasks by the client's group"
                >
                  <option value="All">All groups</option>
                  {groups!.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                  <option value="None">No group</option>
                </select>
              )}
              {seeAll && (
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                >
                  <option value="All">All assignees</option>
                  {staff?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {/* Service type: one chip per practice area, each with its live
                count, so a service's work is one click away. */}
            <ServiceChips value={category} onChange={setCategory} counts={counts} total={(data ?? []).length} />
          </Card>

          <Card>
            {loading && !data ? (
              <Loading label="Loading tasks…" />
            ) : error ? (
              <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={tab === "statutory" ? Landmark : view === "Completed" ? FileCheck2 : ClipboardList}
                title={
                  tab === "statutory"
                    ? "No statutory deadlines here"
                    : view === "Completed"
                      ? "No completed tasks yet"
                      : "No tasks match"
                }
                message={
                  tab === "statutory"
                    ? "Sync the Income Tax, GST or MCA calendar in the Recurring tab, then generate its dates."
                    : view === "Completed"
                      ? "Tasks you complete will be listed here, keeping the in-progress list clear."
                      : "Adjust the filters or create a new task."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                      <th className="px-5 py-3">Task</th>
                      <th className="px-5 py-3">Client</th>
                      <th className="px-5 py-3">Assignee</th>
                      <th className="px-5 py-3">Due</th>
                      <th className="px-5 py-3">Priority</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((t) => {
                      const overdue = t.status !== "Completed" && (daysUntil(t.dueDate) ?? 0) < 0;
                      const meta = taskMeta(t);
                      const chk = checklistDone(t.checklist);
                      const openCount = (t.queries ?? []).filter((q) => q.status !== "Answered").length;
                      const billedNos = [
                        ...new Set(
                          [...(t.invoiceLines ?? []), ...(t.billedLines ?? [])]
                            .map((l) => l.invoice?.invoiceNumber)
                            .filter((n): n is string => !!n),
                        ),
                      ];
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* The recurring marker stays glued to the title
                                  so it never wraps onto a line of its own. */}
                              <span className="flex items-center gap-1.5 font-medium text-slate-800">
                                {t.scheduleId && (
                                  <Repeat className="h-3.5 w-3.5 shrink-0 text-brand-400" aria-label="Recurring" />
                                )}
                                {t.title}
                              </span>
                              <Badge tone={CATEGORY_TONE[t.category]}>{t.category}</Badge>
                              {chk && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenChecklist(openChecklist === t.id ? null : t.id)
                                  }
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs",
                                    openChecklist === t.id
                                      ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                                      : "text-slate-500 hover:bg-slate-100",
                                  )}
                                  title="Show checklist"
                                >
                                  <ListChecks className="h-3.5 w-3.5" />
                                  {chk.done}/{chk.total}
                                </button>
                              )}
                              {/* Client clarifications: amber while any point
                                  is still awaiting an answer. */}
                              <button
                                onClick={() => setOpenQueries(t.id)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs",
                                  openQueries === t.id
                                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                                    : openCount > 0
                                      ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                      : "text-slate-400 hover:bg-slate-100",
                                )}
                                title={
                                  openCount > 0
                                    ? `${openCount} point(s) awaiting the client's clarification`
                                    : "Clarifications from the client"
                                }
                              >
                                <HelpCircle className="h-3.5 w-3.5" />
                                {openCount > 0 ? openCount : ""}
                              </button>
                              {billedNos.length > 0 && (
                                <Badge tone="green">
                                  <Receipt className="h-3 w-3" />
                                  {billedNos.length === 1 ? `Billed · ${billedNos[0]}` : `Billed ×${billedNos.length}`}
                                </Badge>
                              )}
                            </div>
                            {meta.length > 0 && (
                              <p className="mt-0.5 text-xs text-slate-500">{meta.join("  ·  ")}</p>
                            )}
                            {t.description && (
                              <p className="mt-0.5 max-w-md truncate text-xs text-slate-400">{t.description}</p>
                            )}
                            {t.isReturnFiling && t.filingDate && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-fern-700">
                                <FileCheck2 className="h-3 w-3 shrink-0" />
                                Filed {formatDate(t.filingDate)}
                                {t.ackNumber && <span className="text-slate-400">· Ack {t.ackNumber}</span>}
                              </p>
                            )}
                            {openChecklist === t.id && t.checklist && t.checklist.length > 0 && (
                              <ul className="mt-2 max-w-md space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                                {t.checklist.map((step, si) => (
                                  <li key={si} className="flex items-center gap-2 text-xs text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={step.done}
                                      disabled={!canManage}
                                      onChange={() => toggleStep(t, si)}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className={cn(step.done && "text-slate-400 line-through")}>
                                      {step.label}
                                    </span>
                                  </li>
                                ))}
                                <li className="pt-0.5 pl-5 text-[10px] text-slate-400">
                                  Status updates automatically from the steps checked.
                                </li>
                              </ul>
                            )}

                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {t.client?.name ?? <span className="text-slate-400">—</span>}
                            {/* Which of the client's concerns the work is for. */}
                            {t.tradeName?.name && (
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {t.tradeName.name}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {assigneeNames(t) || <span className="text-slate-400">Unassigned</span>}
                            {t.approvedByName ? (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fern-700">
                                <ShieldCheck className="h-3 w-3 shrink-0" /> Approved by {t.approvedByName}
                              </p>
                            ) : t.approver ? (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                                <ShieldCheck className="h-3 w-3 shrink-0" /> Approver: {t.approver.name}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn("text-xs", overdue ? "font-medium text-rose-600" : "text-slate-600")}>
                              {t.dueDate ? dueLabel(t.dueDate) : "—"}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              title={
                                t.priorityManual
                                  ? "Pinned by a Partner/Admin"
                                  : "Auto — from the days left to the due date"
                              }
                            >
                              <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {canManage ? (
                              <select
                                value={t.status}
                                onChange={(e) => quickStatus(t, e.target.value)}
                                className={cn(
                                  "cursor-pointer rounded-full border-0 px-2 py-1 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-brand-300 focus:outline-none",
                                  statusPillClass(t.status),
                                )}
                              >
                                {TASK_STATUSES.map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={cn(
                                  "inline-block rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
                                  statusPillClass(t.status),
                                )}
                              >
                                {t.status}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {t.approverId && t.status !== "Completed" && canApproveTask(t) && (
                                <button
                                  onClick={() => approveTask(t)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                                  title="Give final approval"
                                >
                                  <ShieldCheck className="h-4 w-4" /> Approve
                                </button>
                              )}
                              {canManage && t.isReturnFiling && t.status !== "Completed" && (
                                <button
                                  onClick={() => setFilingFor(t)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-fern-700 hover:bg-fern-50"
                                  title="Record return filing"
                                >
                                  <FileCheck2 className="h-4 w-4" /> Record filing
                                </button>
                              )}
                              {canManage && (
                                <button
                                  onClick={() => {
                                    setEditing(t);
                                    setFormOpen(true);
                                  }}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => setToDelete(t)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                              {!canManage && !canDelete && <span className="text-xs text-slate-300">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {formOpen && (
        <TaskForm
          initial={editing}
          clients={clients ?? []}
          staff={staff ?? []}
          canRecur={canRecur}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {filingFor && (
        <RecordFilingModal
          task={filingFor}
          onClose={() => setFilingFor(null)}
          onSaved={() => {
            setFilingFor(null);
            refresh();
          }}
        />
      )}

      {queriesFor && (
        <TaskQueriesModal
          task={queriesFor}
          canManage={canManage}
          onChanged={(queries) => applyQueries(queriesFor.id, queries)}
          onClose={() => setOpenQueries(null)}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete task?"
        message={`"${toDelete?.title}" will be permanently removed.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/tasks/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ClipboardList;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium",
        active
          ? "border-brand-500 text-brand-700"
          : "border-transparent text-slate-500 hover:text-slate-700",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

// Chip tints per service type — the same colour family the category badge
// uses, so a service reads the same everywhere in the app.
const SERVICE_CHIP: Record<string, { on: string; off: string }> = {
  All: { on: "bg-slate-800 text-white ring-slate-800", off: "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50" },
  "Income Tax": { on: "bg-violet-600 text-white ring-violet-600", off: "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100" },
  TDS: { on: "bg-blue-600 text-white ring-blue-600", off: "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100" },
  GST: { on: "bg-indigo-600 text-white ring-indigo-600", off: "bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100" },
  "MCA/ROC": { on: "bg-amber-600 text-white ring-amber-600", off: "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100" },
  Audit: { on: "bg-rose-600 text-white ring-rose-600", off: "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100" },
  Registration: { on: "bg-fern-600 text-white ring-fern-600", off: "bg-fern-50 text-fern-700 ring-fern-200 hover:bg-fern-100" },
  Other: { on: "bg-slate-600 text-white ring-slate-600", off: "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100" },
};

/**
 * Service-type filter — one chip per practice area with its live count, so
 * "show me only the GST work" is a single click instead of a dropdown hunt.
 */
function ServiceChips({
  value,
  onChange,
  counts,
  total,
}: {
  value: string;
  onChange: (v: string) => void;
  counts: Record<string, number>;
  total: number;
}) {
  // Every master category is offered; ones with no work read as muted zeros
  // so the register's shape stays visible at a glance.
  const items: { key: string; count: number }[] = [
    { key: "All", count: total },
    ...TASK_CATEGORIES.map((c) => ({ key: c as string, count: counts[c] ?? 0 })),
    // Legacy values that survived a rename still deserve a chip when present.
    ...Object.keys(counts)
      .filter((c) => !TASK_CATEGORIES.includes(c as (typeof TASK_CATEGORIES)[number]))
      .map((c) => ({ key: c, count: counts[c] })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2.5">
      <span className="mr-0.5 text-xs font-medium text-slate-400">Service</span>
      {items.map(({ key, count }) => {
        const active = value === key;
        const style = SERVICE_CHIP[key] ?? SERVICE_CHIP.Other;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            data-testid={`service-chip-${key}`}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
              active ? style.on : count === 0 ? "bg-white text-slate-400 ring-slate-200 hover:bg-slate-50" : style.off,
            )}
          >
            {key}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular-nums",
                active ? "bg-white/25" : "bg-white/70",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
    >
      <option value="All">All {label === "category" ? "categories" : label + "es"}</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

function statusPillClass(status: string) {
  switch (status) {
    case "Completed":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    case "In Progress":
      return "bg-blue-100 text-blue-700 ring-blue-200";
    case "Under Review":
      return "bg-amber-100 text-amber-700 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function TaskForm({
  initial,
  clients,
  staff,
  canRecur,
  onClose,
  onSaved,
}: {
  initial: Task | null;
  clients: Client[];
  staff: Staff[];
  canRecur: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Priority defaults to Auto (derived from days left to the due date); only
  // a Partner/Admin may pin an explicit priority.
  const { user: me } = useAuth();
  const canPinPriority = canApproveRole(me?.role);
  const [form, setForm] = useState<FormState>(
    initial
      ? { ...initial, priority: initial.priorityManual ? initial.priority : "Auto" }
      : { category: "Income Tax", status: "Pending", priority: "Auto" },
  );
  // Create the same task for several clients in one go (create mode only).
  const [multiClient, setMultiClient] = useState(false);
  const [clientIds, setClientIds] = useState<string[]>([]);
  // Find a client in the multi-select by name / PAN / GSTIN / group code.
  const [clientSearch, setClientSearch] = useState("");
  const toggleClient = (id: string) =>
    setClientIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const searchedClients = clients.filter((c) => {
    const s = clientSearch.trim().toLowerCase();
    if (!s) return true;
    return [c.name, c.pan, c.gstin, c.tan, c.group?.code].some((v) =>
      v?.toLowerCase().includes(s),
    );
  });
  // GST tasks: create a separate task for each of the client's GSTINs at once.
  const [multiGstin, setMultiGstin] = useState(false);
  const [gstRegIds, setGstRegIds] = useState<string[]>([]);
  const toggleGstReg = (id: string) =>
    setGstRegIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  // Assign to one or more team members, plus an optional approver.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initial?.assignees?.length
      ? initial.assignees.map((a) => a.id)
      : initial?.assigneeId
        ? [initial.assigneeId]
        : [],
  );
  const toggleAssignee = (id: string) =>
    setAssigneeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const [approverId, setApproverId] = useState<string>(initial?.approverId ?? "");
  // Recurring definition fields (only used when the recurring toggle is on).
  const [recurring, setRecurring] = useState(false);
  const [freq, setFreq] = useState("Monthly");
  const [dueDay, setDueDay] = useState(20);
  const [anchorMonth, setAnchorMonth] = useState(4);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const FYS = fyOptions();

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Seed the standard checklist when it's still empty for this category/kind.
  function seedChecklist(next: FormState) {
    if (next.checklist && next.checklist.length > 0) return next.checklist;
    const dc = defaultChecklist(next.category ?? "", {
      taskType: next.taskType,
      gstReturnType: next.gstReturnType,
    });
    return dc.length > 0 ? dc : next.checklist;
  }

  function setCategory(v: string) {
    setForm((f) => {
      // Leaving GST clears the GSTIN linkage (only meaningful for GST tasks).
      const next = {
        ...f,
        category: v,
        taskType: null,
        gstReturnType: null,
        ...(v !== "GST" ? { gstRegistrationId: null, gstin: null } : {}),
      };
      return { ...next, checklist: seedChecklist(next) };
    });
    if (v !== "GST") {
      setMultiGstin(false);
      setGstRegIds([]);
    }
  }
  function setTaskType(v: string) {
    setForm((f) => {
      const next = { ...f, taskType: v || null, title: f.title || v };
      return { ...next, checklist: seedChecklist(next) };
    });
  }
  function setGstReturn(v: string) {
    setForm((f) => {
      const label = v ? (GST_RETURN_LABELS[v] ?? v) : "";
      const next = { ...f, gstReturnType: v || null, title: f.title || label.split(" · ")[0] };
      return { ...next, checklist: seedChecklist(next) };
    });
  }

  function setTdsForm(v: string) {
    setForm((f) => ({
      ...f,
      tdsForm: v || null,
      title: f.title || (v ? `TDS Return · ${tdsFormLabel(v)}` : ""),
      checklist: seedChecklist({ ...f, tdsForm: v || null }),
    }));
  }

  // Return-filing defaults on for GST / ITR / TDS categories until toggled.
  const isReturnFiling = form.isReturnFiling ?? RETURN_CATEGORIES.includes(form.category ?? "");
  const cat = form.category ?? "";
  const gstPeriodic = form.gstReturnType ? GST_PERIODIC_RETURNS.has(form.gstReturnType) : false;
  // The selected client's GST registrations (GSTINs) — a GST task is filed
  // under one of them, and can be created for several at once.
  const selectedClient = clients.find((c) => c.id === form.clientId);
  // Single-client picker options: the search narrows the dropdown, but the
  // currently selected client always stays listed so the value never breaks.
  const singleClientOptions =
    selectedClient && !searchedClients.some((c) => c.id === selectedClient.id)
      ? [selectedClient, ...searchedClients]
      : searchedClients;
  const clientGstRegs = (selectedClient?.gstRegistrations ?? []).filter((g) => g.active);
  // The concerns this client runs under — offered whenever they have any, so
  // the task says which firm the work is for.
  const clientTradeNames = selectedClient?.tradeNames ?? [];
  const canMultiGstin = cat === "GST" && !multiClient && clientGstRegs.length > 1;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (recurring && !isEdit) {
        // Create a recurring obligation and generate its upcoming tasks.
        await apiMutate("/api/schedules", "POST", {
          title: form.title,
          category: form.category,
          frequency: freq,
          dueDay: Number(dueDay) || 1,
          anchorMonth: Number(anchorMonth) || 4,
          // Schedules carry a fixed priority; generated tasks derive theirs.
          priority: form.priority === "Auto" ? "Medium" : form.priority,
          active: true,
          clientId: form.clientId || null,
          assigneeId: assigneeIds[0] || null,
          notes: form.description || null,
        });
        await apiMutate("/api/schedules/generate", "POST", { months: 3 });
        onSaved();
        return;
      }

      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || null,
        clientId: multiClient ? null : form.clientId || null,
        // Only meaningful for a single client — trade names are per client.
        tradeNameId: multiClient ? null : form.tradeNameId || null,
        // One identical task per selected client when multi-client is on.
        clientIds: !isEdit && multiClient && clientIds.length > 0 ? clientIds : undefined,
        assigneeIds,
        approverId: approverId || null,
        taskType: cat === "Income Tax" || cat === "Audit" ? form.taskType || null : null,
        financialYear: form.financialYear || null,
        periodMonth: cat === "GST" && gstPeriodic && form.gstPeriodicity === "Monthly" ? form.periodMonth ?? null : null,
        periodQuarter:
          cat === "TDS" || (cat === "GST" && gstPeriodic && form.gstPeriodicity === "Quarterly")
            ? form.periodQuarter || null
            : null,
        tdsForm: cat === "TDS" ? form.tdsForm || null : null,
        returnNature: cat === "TDS" ? form.returnNature || null : null,
        gstReturnType: cat === "GST" ? form.gstReturnType || null : null,
        gstPeriodicity: cat === "GST" && gstPeriodic ? form.gstPeriodicity || null : null,
        // GST registration (GSTIN) the task is filed under. When "one per
        // GSTIN" is on, gstRegistrationIds drives multi-creation instead.
        gstin: cat === "GST" && !multiGstin ? form.gstin || null : null,
        gstRegistrationId: cat === "GST" && !multiGstin ? form.gstRegistrationId || null : null,
        gstRegistrationIds:
          !isEdit && cat === "GST" && multiGstin && gstRegIds.length > 0 ? gstRegIds : undefined,
        checklist: form.checklist ?? null,
        isReturnFiling,
        filingDate: isReturnFiling ? form.filingDate || null : null,
        ackNumber: isReturnFiling ? form.ackNumber || null : null,
      };
      if (isEdit) await apiMutate(`/api/tasks/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/tasks", "POST", payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? "Edit Task" : "New Task"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              busy ||
              !form.title ||
              (multiClient && clientIds.length === 0) ||
              (multiGstin && gstRegIds.length === 0)
            }
          >
            {busy
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : recurring
                  ? "Create recurring task"
                  : multiGstin && gstRegIds.length > 1
                    ? `Create ${gstRegIds.length} tasks (one per GSTIN)`
                    : multiClient && clientIds.length > 1
                      ? `Create ${clientIds.length} tasks`
                      : "Create task"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">{err}</div>
      )}
      {!isEdit && !form.title && (multiClient ? clientIds.length > 0 : true) && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          Enter a title to {multiClient ? `create this task for ${clientIds.length} client${clientIds.length === 1 ? "" : "s"}` : "create the task"}.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2">
          <Input
            value={form.title ?? ""}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. GSTR-3B – June 2026"
          />
        </Field>
        <Field label="Category" required>
          <Select value={form.category ?? ""} onChange={(e) => setCategory(e.target.value)}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Priority"
          hint={
            (form.priority ?? "Auto") === "Auto"
              ? canPinPriority
                ? `Auto → ${priorityFromDueDate(form.dueDate ?? null)} (0–7 days: Very High · 8–30: High · 31–45: Medium · 45+: Low)`
                : `Auto → ${priorityFromDueDate(form.dueDate ?? null)} from the due date — only a Partner/Admin can pin a priority`
              : "Pinned — it will no longer follow the due date"
          }
        >
          <Select
            value={form.priority ?? "Auto"}
            onChange={(e) => set("priority", e.target.value)}
            disabled={!canPinPriority}
          >
            <option value="Auto">Auto — by days left to due date</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label={multiClient ? "Clients" : "Client"}>
          {multiClient ? (
            <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-2 shadow-sm">
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <span className="text-xs font-medium text-brand-700">
                  {clientIds.length > 0 ? `${clientIds.length} selected` : "Select clients"}
                </span>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      // Select all *matching* clients (adds to the selection).
                      setClientIds((ids) => [...new Set([...ids, ...searchedClients.map((c) => c.id)])])
                    }
                    className="text-brand-600 hover:underline"
                  >
                    {clientSearch.trim() ? "Select matching" : "Select all"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientIds([])}
                    className="text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search client by name / PAN / GSTIN…"
                className="mb-1.5 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                {searchedClients.length === 0 && (
                  <p className="px-1.5 py-1 text-xs text-slate-400">
                    No clients match “{clientSearch}”.
                  </p>
                )}
                {searchedClients.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={clientIds.includes(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              {clientSearch.trim() && clientIds.length > 0 && (
                <p className="mt-1 px-0.5 text-[11px] text-slate-500">
                  {clientIds.length} selected in total (selections outside the search are kept).
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search client by name / PAN / GSTIN…"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
              <Select
                value={form.clientId ?? ""}
                onChange={(e) => {
                  // Switching client clears the GSTIN and trade-name picks
                  // (they belong to the previous client).
                  setForm((f) => ({
                    ...f,
                    clientId: e.target.value,
                    tradeNameId: null,
                    gstRegistrationId: null,
                    gstin: null,
                  }));
                  setMultiGstin(false);
                  setGstRegIds([]);
                }}
              >
                <option value="">— Internal / none —</option>
                {singleClientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {clientSearch.trim() && (
                <p className="px-0.5 text-[11px] text-slate-500">
                  {searchedClients.length === 0
                    ? `No clients match “${clientSearch}”.`
                    : `Dropdown narrowed to ${searchedClients.length} matching client${searchedClients.length === 1 ? "" : "s"}.`}
                </p>
              )}
            </div>
          )}
          {!isEdit && !recurring && (
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={multiClient}
                onChange={(e) => {
                  setMultiClient(e.target.checked);
                  setClientIds(e.target.checked && form.clientId ? [form.clientId] : []);
                  // Multi-client and multi-GSTIN are mutually exclusive.
                  if (e.target.checked) {
                    setMultiGstin(false);
                    setGstRegIds([]);
                  }
                }}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Create this task for multiple clients at once
            </label>
          )}
        </Field>

        {/* Which of the client's concerns the work is for — only offered
            when the client actually runs more than their legal name. */}
        {!multiClient && clientTradeNames.length > 0 && (
          <Field
            label="Firm / trade name"
            hint="Shown beside the client on the task, so it is clear which concern it is for"
          >
            <Select
              value={form.tradeNameId ?? ""}
              onChange={(e) => set("tradeNameId", e.target.value || null)}
              data-testid="task-tradename"
            >
              <option value="">— {selectedClient?.name ?? "Client"} (legal name) —</option>
              {clientTradeNames.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  {tn.name}
                  {tn.gstin ? ` · ${tn.gstin}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="Assigned to"
          hint={assigneeIds.length > 1 ? `${assigneeIds.length} members · the first is the lead` : "One or more team members"}
        >
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 shadow-sm">
            {staff.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={assigneeIds.includes(s.id)}
                  onChange={() => toggleAssignee(s.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="flex-1">
                  {s.name} <span className="text-xs text-slate-400">· {s.role}</span>
                </span>
                {assigneeIds[0] === s.id && assigneeIds.length > 1 && (
                  <Badge tone="indigo">Lead</Badge>
                )}
              </label>
            ))}
          </div>
        </Field>
        <Field
          label="Approver"
          hint="Final sign-off by a Partner/Admin. Work goes 'Under Review' until approved."
        >
          <Select value={approverId} onChange={(e) => setApproverId(e.target.value)}>
            <option value="">— No approval needed —</option>
            {staff
              .filter((s) => canApproveRole(s.role))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.role}
                </option>
              ))}
          </Select>
        </Field>

        {/* One-time vs recurring */}
        {!isEdit && canRecur && !multiClient && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <Repeat className="h-4 w-4 text-brand-600" />
              Make this a recurring task
            </label>
            <p className="mt-1 pl-6 text-xs text-slate-500">
              Recurring tasks are generated automatically each period from the cadence below; the exact period is set
              on each occurrence.
            </p>
            {recurring && (
              <div className="mt-3 grid grid-cols-1 gap-4 pl-6 sm:grid-cols-2">
                <Field label="Frequency">
                  <Select value={freq} onChange={(e) => setFreq(e.target.value)}>
                    {SCHEDULE_FREQUENCIES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Due day of month" hint="1–31 (clamped to shorter months)">
                  <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} />
                </Field>
                {freq !== "Monthly" && (
                  <Field label="Cycle anchor month" className="sm:col-span-2">
                    <Select value={String(anchorMonth)} onChange={(e) => setAnchorMonth(Number(e.target.value))}>
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            )}
          </div>
        )}

        {/* One-time task: status, due date, and category-specific fields */}
        {!recurring && (
          <>
            <Field label="Status">
              <Select value={form.status ?? ""} onChange={(e) => set("status", e.target.value)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={toDateInput(form.dueDate)} onChange={(e) => set("dueDate", e.target.value)} />
            </Field>

            {cat === "Income Tax" && (
              <>
                <Field label="Income-tax task type">
                  <Select value={form.taskType ?? ""} onChange={(e) => setTaskType(e.target.value)}>
                    <option value="">— Select —</option>
                    {INCOME_TAX_TASK_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assessment / Tax Year" hint="Labelled AY or TY per the Income-tax Act 2025.">
                  <Select value={form.financialYear ?? ""} onChange={(e) => set("financialYear", e.target.value)}>
                    <option value="">— Select year —</option>
                    {FYS.map((fy) => (
                      <option key={fy} value={fy}>
                        {taxPeriodOption(fy)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            {cat === "Audit" && (
              <>
                <Field label="Audit type" hint="Picks a default work-programme checklist.">
                  <Select value={form.taskType ?? ""} onChange={(e) => setTaskType(e.target.value)}>
                    <option value="">— Select audit —</option>
                    {AUDIT_SUBCATEGORIES.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Financial year">
                  <Select value={form.financialYear ?? ""} onChange={(e) => set("financialYear", e.target.value)}>
                    <option value="">— Select FY —</option>
                    {FYS.map((fy) => (
                      <option key={fy} value={fy}>
                        FY {fy}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            {cat === "TDS" && (
              <>
                <Field label="TDS return form" hint="New Income-tax Act 2025 / erstwhile 1961-Act number.">
                  <Select value={form.tdsForm ?? ""} onChange={(e) => setTdsForm(e.target.value)}>
                    <option value="">— Select form —</option>
                    {TDS_RETURN_FORMS.map((f) => (
                      <option key={f.newNo} value={f.newNo}>
                        Form {f.newNo} / {f.oldNo} · {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quarter">
                  <Select value={form.periodQuarter ?? ""} onChange={(e) => set("periodQuarter", e.target.value)}>
                    <option value="">— Select quarter —</option>
                    {QUARTERS.map((qk) => (
                      <option key={qk} value={qk}>
                        {QUARTER_LABELS[qk]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assessment / Tax Year">
                  <Select value={form.financialYear ?? ""} onChange={(e) => set("financialYear", e.target.value)}>
                    <option value="">— Select year —</option>
                    {FYS.map((fy) => (
                      <option key={fy} value={fy}>
                        {taxPeriodOption(fy)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Return nature">
                  <Select value={form.returnNature ?? ""} onChange={(e) => set("returnNature", e.target.value)}>
                    <option value="">— Select —</option>
                    {TDS_RETURN_NATURE.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            {cat === "GST" && (
              <>
                <Field label="GST return">
                  <Select value={form.gstReturnType ?? ""} onChange={(e) => setGstReturn(e.target.value)}>
                    <option value="">— Select return —</option>
                    {GST_RETURN_TYPES.map((g) => (
                      <option key={g} value={g}>
                        {GST_RETURN_LABELS[g] ?? g}
                      </option>
                    ))}
                  </Select>
                </Field>

                {/* GSTIN picker — a client with several registrations files
                    each GSTIN separately, so the task is pinned to one GSTIN
                    (or created once per GSTIN). */}
                {form.clientId ? (
                  clientGstRegs.length === 0 ? (
                    <Field label="GSTIN" className="sm:col-span-2">
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                        This client has no GST registrations yet. Add the GSTIN(s) on the client to
                        file separate GST tasks per registration.
                      </p>
                    </Field>
                  ) : multiGstin ? (
                    <Field
                      label="GSTINs"
                      className="sm:col-span-2"
                      hint="One task will be created for each selected GSTIN"
                    >
                      <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-2 shadow-sm">
                        <div className="mb-1.5 flex items-center justify-between px-0.5">
                          <span className="text-xs font-medium text-brand-700">
                            {gstRegIds.length > 0 ? `${gstRegIds.length} selected` : "Select GSTINs"}
                          </span>
                          <div className="flex gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setGstRegIds(clientGstRegs.map((g) => g.id))}
                              className="text-brand-600 hover:underline"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => setGstRegIds([])}
                              className="text-slate-500 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1 rounded-md border border-slate-200 bg-white p-2">
                          {clientGstRegs.map((g) => (
                            <label
                              key={g.id}
                              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={gstRegIds.includes(g.id)}
                                onChange={() => toggleGstReg(g.id)}
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                              {gstRegLabel(g)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </Field>
                  ) : (
                    <Field label="GSTIN" hint="Which registration this return is filed under">
                      <Select
                        value={form.gstRegistrationId ?? ""}
                        onChange={(e) => {
                          const reg = clientGstRegs.find((g) => g.id === e.target.value);
                          setForm((f) => ({
                            ...f,
                            gstRegistrationId: reg?.id ?? null,
                            gstin: reg?.gstin ?? null,
                          }));
                        }}
                      >
                        <option value="">— Select GSTIN —</option>
                        {clientGstRegs.map((g) => (
                          <option key={g.id} value={g.id}>
                            {gstRegLabel(g)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )
                ) : null}
                {canMultiGstin && !isEdit && !recurring && (
                  <label className="-mt-1 flex cursor-pointer items-center gap-2 text-xs text-slate-600 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={multiGstin}
                      onChange={(e) => {
                        setMultiGstin(e.target.checked);
                        setGstRegIds(
                          e.target.checked && form.gstRegistrationId ? [form.gstRegistrationId] : [],
                        );
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Create a separate task for each of this client&apos;s GSTINs
                  </label>
                )}

                {gstPeriodic ? (
                  <>
                    <Field label="Periodicity">
                      <Select
                        value={form.gstPeriodicity ?? ""}
                        onChange={(e) => set("gstPeriodicity", e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {GST_PERIODICITY.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </Select>
                    </Field>
                    {form.gstPeriodicity === "Monthly" && (
                      <Field label="Month">
                        <Select
                          value={form.periodMonth ? String(form.periodMonth) : ""}
                          onChange={(e) => set("periodMonth", e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">— Select month —</option>
                          {MONTHS.map((m, i) => (
                            <option key={m} value={i + 1}>
                              {m}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    {form.gstPeriodicity === "Quarterly" && (
                      <Field label="Quarter">
                        <Select value={form.periodQuarter ?? ""} onChange={(e) => set("periodQuarter", e.target.value)}>
                          <option value="">— Select quarter —</option>
                          {QUARTERS.map((qk) => (
                            <option key={qk} value={qk}>
                              {QUARTER_LABELS[qk]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                  </>
                ) : null}
                <Field label="Financial year">
                  <Select value={form.financialYear ?? ""} onChange={(e) => set("financialYear", e.target.value)}>
                    <option value="">— Select FY —</option>
                    {FYS.map((fy) => (
                      <option key={fy} value={fy}>
                        FY {fy}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            <Field label="Description" className="sm:col-span-2">
              <Textarea
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Scope, notes…"
              />
            </Field>

            {/* Checklist — the task status follows the steps checked. */}
            <ChecklistEditor
              className="sm:col-span-2"
              items={form.checklist ?? []}
              onChange={(list) => {
                set("checklist", list);
                const derived = checklistStatus(list);
                if (derived) set("status", derived);
              }}
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={isReturnFiling}
                  onChange={(e) => set("isReturnFiling", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <FileCheck2 className="h-4 w-4 text-fern-600" />
                Return-filing task (GST, ITR, TDS…)
              </label>
              <p className="mt-1 pl-6 text-xs text-slate-500">
                Enter the filing date &amp; acknowledgment to record the return — the task is then marked complete
                automatically.
              </p>
              {isReturnFiling && (
                <div className="mt-3 grid grid-cols-1 gap-4 pl-6 sm:grid-cols-2">
                  <Field label="Filing date" hint="Setting this completes the task.">
                    <Input
                      type="date"
                      value={toDateInput(form.filingDate)}
                      onChange={(e) => set("filingDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Acknowledgment no.">
                    <Input
                      value={form.ackNumber ?? ""}
                      onChange={(e) => set("ackNumber", e.target.value)}
                      placeholder="e.g. 123456780123456"
                    />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function RecordFilingModal({
  task,
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [filingDate, setFilingDate] = useState(toDateInput(task.filingDate) || toDateInput(new Date()));
  const [ackNumber, setAckNumber] = useState(task.ackNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await apiMutate(`/api/tasks/${task.id}`, "POST", { filingDate, ackNumber });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record filing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record return filing"
      description={task.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !filingDate}>
            <FileCheck2 className="h-4 w-4" />
            {busy ? "Saving…" : "Mark as filed"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">{err}</div>
      )}
      <div className="rounded-lg bg-fern-50 px-3 py-2 text-xs text-fern-800 ring-1 ring-fern-200">
        Recording the filing marks this task as <strong>Completed</strong>.
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Filing date" required>
          <Input type="date" value={filingDate} onChange={(e) => setFilingDate(e.target.value)} />
        </Field>
        <Field label="Acknowledgment no.">
          <Input value={ackNumber} onChange={(e) => setAckNumber(e.target.value)} placeholder="e.g. 123456780123456" />
        </Field>
      </div>
    </Modal>
  );
}
