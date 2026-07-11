"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
  Repeat,
  FileCheck2,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Task, Client, Staff } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CATEGORY_TONE,
  PRIORITY_TONE,
} from "@/lib/constants";
import { dueLabel, daysUntil, toDateInput, formatDate, cn } from "@/lib/format";

// Categories whose tasks are completed by recording a return-filing entry.
const RETURN_CATEGORIES = ["GST", "Income Tax", "TDS"];

type FormState = Partial<Task>;

export default function TasksPage() {
  const { can } = useAuth();
  const canManage = can("manageTasks");
  const canDelete = can("deleteTasks");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
  const [assignee, setAssignee] = useState("All");

  const url =
    `/api/tasks?q=${encodeURIComponent(q)}&status=${status}` +
    `&category=${encodeURIComponent(category)}&assigneeId=${assignee}`;
  const { data, loading, error, refresh } = useResource<Task[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");
  const { data: staff } = useResource<Staff[]>("/api/staff");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [filingFor, setFilingFor] = useState<Task | null>(null);

  async function quickStatus(t: Task, newStatus: string) {
    await apiMutate(`/api/tasks/${t.id}`, "PATCH", { status: newStatus });
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Compliance & Tasks"
        subtitle="Track GST, income-tax, audit, ROC and other engagements"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Task
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tasks…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <FilterSelect value={status} onChange={setStatus} label="status" options={TASK_STATUSES} />
          <FilterSelect value={category} onChange={setCategory} label="category" options={TASK_CATEGORIES} />
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
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading tasks…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No tasks match"
            message="Adjust the filters or create a new compliance task."
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
                {data.map((t) => {
                  const overdue =
                    t.status !== "Completed" && (daysUntil(t.dueDate) ?? 0) < 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {t.scheduleId && (
                            <Repeat
                              className="h-3.5 w-3.5 shrink-0 text-brand-400"
                              aria-label="Recurring"
                            />
                          )}
                          <span className="font-medium text-slate-800">{t.title}</span>
                          <Badge tone={CATEGORY_TONE[t.category]}>{t.category}</Badge>
                        </div>
                        {t.description && (
                          <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                            {t.description}
                          </p>
                        )}
                        {t.isReturnFiling && t.filingDate && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-fern-700">
                            <FileCheck2 className="h-3 w-3 shrink-0" />
                            Filed {formatDate(t.filingDate)}
                            {t.ackNumber && <span className="text-slate-400">· Ack {t.ackNumber}</span>}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {t.client?.name ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {t.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("text-xs", overdue ? "font-medium text-rose-600" : "text-slate-600")}>
                          {t.dueDate ? dueLabel(t.dueDate) : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
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
                          {!canManage && !canDelete && (
                            <span className="text-xs text-slate-300">—</span>
                          )}
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

      {formOpen && (
        <TaskForm
          initial={editing}
          clients={clients ?? []}
          staff={staff ?? []}
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
  onClose,
  onSaved,
}: {
  initial: Task | null;
  clients: Client[];
  staff: Staff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? { category: "GST", status: "Pending", priority: "Medium" },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Return-filing defaults on for GST / ITR / TDS categories until toggled.
  const isReturnFiling =
    form.isReturnFiling ?? RETURN_CATEGORIES.includes(form.category ?? "");

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || null,
        clientId: form.clientId || null,
        assigneeId: form.assigneeId || null,
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
      title={isEdit ? "Edit Task" : "New Compliance Task"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.title}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
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
          <Select value={form.category ?? ""} onChange={(e) => set("category", e.target.value)}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={form.priority ?? ""} onChange={(e) => set("priority", e.target.value)}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Client">
          <Select
            value={form.clientId ?? ""}
            onChange={(e) => set("clientId", e.target.value)}
          >
            <option value="">— Internal / none —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select
            value={form.assigneeId ?? ""}
            onChange={(e) => set("assigneeId", e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            {TASK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input
            type="date"
            value={toDateInput(form.dueDate)}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Scope, notes, checklist…"
          />
        </Field>

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
            Enter the filing date &amp; acknowledgment to record the return — the
            task is then marked complete automatically.
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
  const [filingDate, setFilingDate] = useState(
    toDateInput(task.filingDate) || toDateInput(new Date()),
  );
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
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      <div className="rounded-lg bg-fern-50 px-3 py-2 text-xs text-fern-800 ring-1 ring-fern-200">
        Recording the filing marks this task as <strong>Completed</strong>.
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Filing date" required>
          <Input
            type="date"
            value={filingDate}
            onChange={(e) => setFilingDate(e.target.value)}
          />
        </Field>
        <Field label="Acknowledgment no.">
          <Input
            value={ackNumber}
            onChange={(e) => setAckNumber(e.target.value)}
            placeholder="e.g. 123456780123456"
          />
        </Field>
      </div>
    </Modal>
  );
}
