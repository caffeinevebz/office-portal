"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Repeat,
  CalendarClock,
  Info,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { ComplianceSchedule, Client, Staff } from "@/lib/types";
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
  TASK_PRIORITIES,
  SCHEDULE_FREQUENCIES,
  MONTHS,
  STATUTORY_PRESETS,
  CATEGORY_TONE,
} from "@/lib/constants";
import { describeSchedule, computeOccurrences } from "@/lib/schedule";
import { formatDate } from "@/lib/format";

type FormState = Partial<ComplianceSchedule>;

function nextDue(s: ComplianceSchedule) {
  const occ = computeOccurrences(
    { title: s.title, frequency: s.frequency, dueDay: s.dueDay, anchorMonth: s.anchorMonth },
    12,
  );
  return occ[0]?.dueDate ?? null;
}

export default function SchedulesPage() {
  const { can } = useAuth();
  const canManage = can("manageSchedules");
  const { data, loading, error, refresh } = useResource<ComplianceSchedule[]>("/api/schedules");
  const { data: clients } = useResource<Client[]>("/api/clients");
  const { data: staff } = useResource<Staff[]>("/api/staff");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ComplianceSchedule | null>(null);
  const [toDelete, setToDelete] = useState<ComplianceSchedule | null>(null);

  const [months, setMonths] = useState(3);
  const [gen, setGen] = useState<{ busy: boolean; msg: string | null }>({
    busy: false,
    msg: null,
  });

  async function generate() {
    setGen({ busy: true, msg: null });
    try {
      const res = (await apiMutate("/api/schedules/generate", "POST", { months })) as {
        created: number;
      };
      setGen({
        busy: false,
        msg:
          res.created > 0
            ? `Created ${res.created} task${res.created === 1 ? "" : "s"} for the next ${months} month${months === 1 ? "" : "s"}.`
            : "All upcoming tasks are already generated — nothing to do.",
      });
      refresh();
    } catch (e) {
      setGen({ busy: false, msg: e instanceof Error ? e.message : "Generation failed" });
    }
  }

  return (
    <div>
      <PageHeader
        title="Recurring Compliance"
        subtitle="A statutory calendar that auto-creates upcoming deadline tasks"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Obligation
            </Button>
          ) : undefined
        }
      />

      {canManage && (
        <Card className="mb-4">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <p>
                Generate compliance tasks from every active obligation below.
                Runs are <strong>safe to repeat</strong> — already-created
                deadlines are skipped.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={String(months)}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="w-auto"
              >
                <option value="3">Next 3 months</option>
                <option value="6">Next 6 months</option>
                <option value="12">Next 12 months</option>
              </Select>
              <Button onClick={generate} disabled={gen.busy}>
                <Sparkles className="h-4 w-4" />
                {gen.busy ? "Generating…" : "Generate tasks"}
              </Button>
            </div>
          </div>
          {gen.msg && (
            <div className="border-t border-slate-100 bg-indigo-50/50 px-4 py-2 text-xs text-indigo-700">
              {gen.msg}
            </div>
          )}
        </Card>
      )}

      <Card>
        {loading && !data ? (
          <Loading label="Loading schedules…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No recurring obligations yet"
            message="Add an obligation from the statutory calendar to start auto-generating deadlines."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Obligation</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Cadence</th>
                  <th className="px-5 py-3">Next due</th>
                  <th className="px-5 py-3">Assignee</th>
                  <th className="px-5 py-3">Generated</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((s) => (
                  <tr key={s.id} className={s.active ? "hover:bg-slate-50" : "bg-slate-50/40"}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-3.5 w-3.5 text-indigo-400" />
                        <span className="font-medium text-slate-800">{s.title}</span>
                        <Badge tone={CATEGORY_TONE[s.category]}>{s.category}</Badge>
                        {!s.active && <Badge tone="slate">Paused</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {s.client?.name ?? <span className="text-slate-400">All / none</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{describeSchedule(s)}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(nextDue(s))}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {s.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{s._count?.tasks ?? 0}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage ? (
                          <>
                            <button
                              onClick={() => {
                                setEditing(s);
                                setFormOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setToDelete(s)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <ScheduleForm
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

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete obligation?"
        message={`"${toDelete?.title}" will be removed. Already-generated tasks are kept.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/schedules/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function ScheduleForm({
  initial,
  clients,
  staff,
  onClose,
  onSaved,
}: {
  initial: ComplianceSchedule | null;
  clients: Client[];
  staff: Staff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? {
      title: "",
      category: "GST",
      frequency: "Monthly",
      dueDay: 20,
      anchorMonth: 4,
      priority: "Medium",
      active: true,
    },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string | number | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  function applyPreset(label: string) {
    const p = STATUTORY_PRESETS.find((x) => x.label === label);
    if (!p) return;
    setForm((f) => ({
      ...f,
      title: p.title,
      category: p.category,
      frequency: p.frequency,
      dueDay: p.dueDay,
      anchorMonth: p.anchorMonth,
    }));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        title: form.title,
        category: form.category,
        frequency: form.frequency,
        dueDay: Number(form.dueDay) || 1,
        anchorMonth: Number(form.anchorMonth) || 4,
        priority: form.priority,
        active: form.active ?? true,
        clientId: form.clientId || null,
        assigneeId: form.assigneeId || null,
        notes: form.notes,
      };
      if (isEdit) await apiMutate(`/api/schedules/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/schedules", "POST", payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const showAnchor = form.frequency !== "Monthly";

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? "Edit Obligation" : "New Recurring Obligation"}
      description="Define a statutory obligation; tasks are generated from it on demand."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.title}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create obligation"}
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
        {!isEdit && (
          <Field
            label="Start from the statutory calendar"
            hint="Pick a common obligation to pre-fill, then adjust."
            className="sm:col-span-2"
          >
            <Select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">— Custom / choose a preset —</option>
              {STATUTORY_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label} · {p.hint}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Title" required>
          <Input
            value={form.title ?? ""}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. GSTR-3B"
          />
        </Field>
        <Field label="Category">
          <Select value={form.category ?? ""} onChange={(e) => set("category", e.target.value)}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Frequency">
          <Select value={form.frequency ?? ""} onChange={(e) => set("frequency", e.target.value)}>
            {SCHEDULE_FREQUENCIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Field label="Due day of month" hint="1–31 (clamped to shorter months)">
          <Input
            type="number"
            min={1}
            max={31}
            value={form.dueDay ?? 20}
            onChange={(e) => set("dueDay", e.target.value)}
          />
        </Field>
        {showAnchor && (
          <Field
            label="Cycle anchor month"
            hint="One due month; the cycle repeats from here."
            className="sm:col-span-2"
          >
            <Select
              value={String(form.anchorMonth ?? 4)}
              onChange={(e) => set("anchorMonth", Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Client">
          <Select value={form.clientId ?? ""} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">— None / firm-wide —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Default assignee">
          <Select value={form.assigneeId ?? ""} onChange={(e) => set("assigneeId", e.target.value)}>
            <option value="">— Unassigned —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
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
        <Field label="Status">
          <Select
            value={form.active === false ? "Paused" : "Active"}
            onChange={(e) => set("active", e.target.value === "Active")}
          >
            <option>Active</option>
            <option>Paused</option>
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
