"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Repeat,
  CalendarClock,
  Info,
  Landmark,
  RefreshCw,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { ComplianceSchedule, Client, Staff } from "@/lib/types";
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
import { STATUTORY_LAWS } from "@/lib/it-calendar";
import { describeSchedule, computeOccurrences } from "@/lib/schedule";
import { formatDate } from "@/lib/format";

type FormState = Partial<ComplianceSchedule>;

// Which statutory calendar an obligation was synced from, for the row badge.
const SOURCE_LABEL: Record<string, string> = {
  "income-tax": "IT calendar",
  gst: "GST calendar",
  mca: "MCA calendar",
};

function nextDue(s: ComplianceSchedule) {
  const occ = computeOccurrences(
    { title: s.title, frequency: s.frequency, dueDay: s.dueDay, anchorMonth: s.anchorMonth },
    12,
  );
  return occ[0]?.dueDate ?? null;
}

/**
 * The "Recurring" workspace — recurring obligations and the tools that turn
 * them into dated tasks. Rendered inside the Tasks page as its second tab.
 */
export function RecurringPanel({ addSignal }: { addSignal?: number }) {
  const { can } = useAuth();
  const canManage = can("manageSchedules");
  const { data, loading, error, refresh } = useResource<ComplianceSchedule[]>("/api/schedules");
  const { data: clients } = useResource<Client[]>("/api/clients?slim=1");
  const { data: staff } = useResource<Staff[]>("/api/staff");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ComplianceSchedule | null>(null);
  const [toDelete, setToDelete] = useState<ComplianceSchedule | null>(null);

  const [months, setMonths] = useState(3);
  const [gen, setGen] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const [sync, setSync] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  // Which statutory calendar to pull in — one law, or all three at once.
  const [syncLaw, setSyncLaw] = useState<string>("All");

  // The parent's "Add recurring" button bumps addSignal to open the form.
  const seenSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== seenSignal.current) {
      seenSignal.current = addSignal;
      setEditing(null);
      setFormOpen(true);
    }
  }, [addSignal]);

  async function generate() {
    setGen({ busy: true, msg: null });
    try {
      const res = (await apiMutate("/api/schedules/generate", "POST", { months })) as { created: number };
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

  async function syncCalendar() {
    setSync({ busy: true, msg: null });
    try {
      const res = (await apiMutate("/api/schedules/sync-income-tax", "POST", { law: syncLaw })) as {
        created: number;
        updated: number;
        unchanged: number;
        total: number;
      };
      const what = syncLaw === "All" ? "statutory calendars" : `${syncLaw} calendar`;
      setSync({
        busy: false,
        msg:
          res.created === 0 && res.updated === 0
            ? `Already in sync — all ${res.total} ${what} entries are up to date.`
            : `${syncLaw === "All" ? "Statutory calendars" : `${syncLaw} calendar`} synced: ${res.created} added, ${res.updated} updated, ${res.unchanged} already current.`,
      });
      refresh();
    } catch (e) {
      setSync({ busy: false, msg: e instanceof Error ? e.message : "Sync failed" });
    }
  }

  return (
    <div>
      {canManage && (
        <Card className="mb-4">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <p>
                Turn every active recurring obligation below into dated tasks. Runs are{" "}
                <strong>safe to repeat</strong> — already-created deadlines are skipped.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select value={String(months)} onChange={(e) => setMonths(Number(e.target.value))} className="w-auto">
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
            <div className="border-t border-slate-100 bg-brand-50/50 px-4 py-2 text-xs text-brand-700">{gen.msg}</div>
          )}
          <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-fern-600" />
              <p>
                Pull the <strong>statutory due-date calendars</strong> — Income Tax (advance tax, TDS payments &amp;
                returns, ITR &amp; audit dates), GST (GSTR-1/3B, QRMP, annual returns) and MCA/ROC (AOC-4, MGT-7,
                DIR-3 KYC, DPT-3) — into this list. Re-syncing updates dates in place, never duplicates.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={syncLaw}
                onChange={(e) => setSyncLaw(e.target.value)}
                className="w-auto"
                aria-label="Statutory calendar to sync"
              >
                <option value="All">All calendars</option>
                {STATUTORY_LAWS.map((l) => (
                  <option key={l} value={l}>
                    {l === "MCA" ? "MCA / ROC" : l}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={syncCalendar} disabled={sync.busy}>
                <RefreshCw className={`h-4 w-4 ${sync.busy ? "animate-spin" : ""}`} />
                {sync.busy ? "Syncing…" : "Sync calendar"}
              </Button>
            </div>
          </div>
          {sync.msg && (
            <div className="border-t border-slate-100 bg-fern-50/60 px-4 py-2 text-xs text-fern-700">{sync.msg}</div>
          )}
        </Card>
      )}

      <Card>
        {loading && !data ? (
          <Loading label="Loading recurring tasks…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No recurring tasks yet"
            message="Mark a task as recurring when you create it, or add an obligation here to auto-generate deadlines."
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
                        <Repeat className="h-3.5 w-3.5 text-brand-400" />
                        <span className="font-medium text-slate-800">{s.title}</span>
                        <Badge tone={CATEGORY_TONE[s.category]}>{s.category}</Badge>
                        {SOURCE_LABEL[s.source ?? ""] && (
                          <Badge tone="amber">
                            <Landmark className="h-3 w-3" /> {SOURCE_LABEL[s.source ?? ""]}
                          </Badge>
                        )}
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
        title="Delete recurring obligation?"
        message={`"${toDelete?.title}" will be removed. Already-generated tasks are kept.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/schedules/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

/** A small toolbar button the parent renders to add a recurring obligation. */
export function AddRecurringButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus className="h-4 w-4" /> Add recurring
    </Button>
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
  const set = (k: keyof FormState, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  // One obligation, many clients: create a separate schedule per client so
  // each generates (and can be reassigned) on its own. Create mode only —
  // an existing schedule belongs to exactly one client.
  const [scope, setScope] = useState<"one" | "many" | "all">("one");
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const toggleClient = (id: string) =>
    setClientIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const searchedClients = clients.filter((c) => {
    const s = clientSearch.trim().toLowerCase();
    if (!s) return true;
    return [c.name, c.pan, c.gstin, c.tan, c.group?.code].some((v) => v?.toLowerCase().includes(s));
  });
  const activeCount = clients.filter((c) => c.status !== "Inactive").length;

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
        clientId: isEdit || scope === "one" ? form.clientId || null : null,
        // Fan out to several clients (or every active one) on create.
        clientIds: !isEdit && scope === "many" && clientIds.length > 0 ? clientIds : undefined,
        allClients: !isEdit && scope === "all" ? true : undefined,
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
      title={isEdit ? "Edit recurring obligation" : "New recurring obligation"}
      description="Define a recurring obligation; dated tasks are generated from it on demand."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.title || (scope === "many" && clientIds.length === 0)}>
            {busy
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : scope === "many" && clientIds.length > 1
                  ? `Create for ${clientIds.length} clients`
                  : scope === "all"
                    ? `Create for ${activeCount} clients`
                    : "Create obligation"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">{err}</div>
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
          <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. GSTR-3B" />
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
          <Field label="Cycle anchor month" hint="One due month; the cycle repeats from here." className="sm:col-span-2">
            <Select value={String(form.anchorMonth ?? 4)} onChange={(e) => set("anchorMonth", Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label={scope === "one" ? "Client" : "Clients"}
          className={scope === "one" ? undefined : "sm:col-span-2"}
          hint={
            isEdit
              ? undefined
              : scope === "many"
                ? "One obligation is created per selected client."
                : scope === "all"
                  ? `One obligation will be created for each of the ${activeCount} active client(s).`
                  : undefined
          }
        >
          {!isEdit && (
            <div className="mb-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(
                [
                  ["one", "One client"],
                  ["many", "Several clients"],
                  ["all", "All active clients"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScope(k)}
                  data-testid={`schedule-scope-${k}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    scope === k ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {isEdit || scope === "one" ? (
            <Select value={form.clientId ?? ""} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">— None / firm-wide —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : scope === "all" ? (
            <p className="rounded-lg bg-fern-50 px-3 py-2 text-xs text-fern-800 ring-1 ring-fern-200">
              Every active client gets their own copy of this obligation, so each client&apos;s deadlines
              generate and can be assigned separately.
            </p>
          ) : (
            <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-2 shadow-sm">
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <span className="text-xs font-medium text-brand-700">
                  {clientIds.length > 0 ? `${clientIds.length} selected` : "Select clients"}
                </span>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setClientIds((ids) => [...new Set([...ids, ...searchedClients.map((c) => c.id)])])
                    }
                    className="text-brand-600 hover:underline"
                  >
                    {clientSearch.trim() ? "Select matching" : "Select all"}
                  </button>
                  <button type="button" onClick={() => setClientIds([])} className="text-slate-500 hover:underline">
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
                  <p className="px-1.5 py-1 text-xs text-slate-400">No clients match “{clientSearch}”.</p>
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
            </div>
          )}
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
