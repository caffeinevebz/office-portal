"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Landmark,
  FileCheck2,
  Hourglass,
  IndianRupee,
  ClipboardList,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { ItrFiling, Client, Staff } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import {
  ITR_REGIMES,
  ITR_STATUSES,
  ITR_STATUS_TONE,
  RETURN_TYPES,
  QUARTERS,
  QUARTER_LABELS,
  MONTHS,
  filingFormOptions,
  financialYears,
  incomeTaxYearLabel,
} from "@/lib/constants";
import { formatCurrency, formatDate, toDateInput, cn } from "@/lib/format";

type FormState = Partial<ItrFiling>;

const TYPE_TONE: Record<string, "violet" | "blue" | "indigo" | "amber"> = {
  ITR: "violet",
  TDS: "blue",
  GST: "indigo",
  MCA: "amber",
};

function statusPillClass(status: string) {
  switch (status) {
    case "Processed":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    case "Filed":
      return "bg-brand-100 text-brand-700 ring-brand-200";
    case "E-Verified":
      return "bg-violet-100 text-violet-700 ring-violet-200";
    case "In Preparation":
      return "bg-blue-100 text-blue-700 ring-blue-200";
    case "Defective":
      return "bg-rose-100 text-rose-700 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

// The register period for a row: quarter, month, or blank.
function periodLabel(f: ItrFiling): string {
  if (f.periodQuarter) return f.periodQuarter;
  if (f.periodMonth) return MONTHS[f.periodMonth - 1];
  return "";
}

export default function FilingRegisterPage() {
  const { can } = useAuth();
  const canManage = can("manageItr");
  const canDelete = can("deleteItr");
  const fys = financialYears();
  // Default to the year currently being filed (previous FY, e.g. FY 2025-26).
  const [fy, setFy] = useState(fys[1] ?? fys[0]);
  const [type, setType] = useState("All");
  const [status, setStatus] = useState("All");
  const [q, setQ] = useState("");
  const url =
    `/api/itr?fy=${encodeURIComponent(fy)}&type=${encodeURIComponent(type)}` +
    `&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`;
  const { data, loading, error, refresh } = useResource<ItrFiling[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");
  const { data: staff } = useResource<Staff[]>("/api/staff");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ItrFiling | null>(null);
  const [toDelete, setToDelete] = useState<ItrFiling | null>(null);

  const all = data ?? [];
  const filedOrBetter = all.filter((f) =>
    ["Filed", "E-Verified", "Processed"].includes(f.status),
  );
  const pending = all.filter(
    (f) => f.status === "Documents Awaited" || f.status === "In Preparation",
  );
  const refunds = all.reduce((s, f) => s + (f.refundAmount ?? 0), 0);

  async function quickStatus(f: ItrFiling, s: string) {
    await apiMutate(`/api/itr/${f.id}`, "PATCH", { status: s });
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Filing Register"
        subtitle="Every return the firm files — ITR, TDS, GST & MCA — updated automatically from tasks"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Filing
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Returns · FY ${fy}${type === "All" ? "" : ` · ${type}`}`}
          value={all.length}
          icon={Landmark}
          accent="indigo"
        />
        <StatCard
          label="Filed / verified / processed"
          value={filedOrBetter.length}
          icon={FileCheck2}
          accent="emerald"
        />
        <StatCard
          label="Still in progress"
          value={pending.length}
          icon={Hourglass}
          accent={pending.length > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Refunds claimed"
          value={formatCurrency(refunds)}
          icon={IndianRupee}
          accent="blue"
        />
      </div>

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search client, PAN, form or ack. no…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All return types</option>
            {RETURN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            {fys.map((a) => (
              <option key={a} value={a}>
                FY {a} · {incomeTaxYearLabel(a)}
              </option>
            ))}
            <option value="All">All financial years</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All statuses</option>
            {ITR_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading filings…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : all.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No filings for this selection"
            message="Add filings here, or record a filing on a return task to post it into the register automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Return / Form</th>
                  <th className="px-5 py-3">Year / Period</th>
                  <th className="px-5 py-3">Assignee</th>
                  <th className="px-5 py-3">Filed on</th>
                  <th className="px-5 py-3">Ack. no. / refund</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((f) => {
                  const taxYear = f.returnType === "ITR" || f.returnType === "TDS";
                  const period = periodLabel(f);
                  return (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{f.client?.name}</p>
                        <p className="text-xs text-slate-500">
                          {f.client?.pan ?? "No PAN"}
                          {f.returnType === "ITR" ? ` · ${f.regime} regime` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={TYPE_TONE[f.returnType] ?? "slate"}>{f.returnType}</Badge>
                          <Badge tone="slate">{f.formType}</Badge>
                        </div>
                        {f.task && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-fern-700">
                            <ClipboardList className="h-3 w-3 shrink-0" />
                            From task: {f.task.title}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-700">
                          {f.financialYear
                            ? taxYear
                              ? incomeTaxYearLabel(f.financialYear)
                              : `FY ${f.financialYear}`
                            : "—"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {f.financialYear && taxYear ? `FY ${f.financialYear}` : ""}
                          {period ? `${f.financialYear && taxYear ? " · " : ""}${period}` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {f.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(f.filedOn)}</td>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs text-slate-600">{f.ackNumber ?? "—"}</p>
                        {f.refundAmount != null && f.refundAmount > 0 && (
                          <p className="text-xs text-emerald-600">
                            Refund {formatCurrency(f.refundAmount)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {canManage ? (
                          <select
                            value={f.status}
                            onChange={(e) => quickStatus(f, e.target.value)}
                            className={cn(
                              "cursor-pointer rounded-full border-0 px-2 py-1 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-brand-300 focus:outline-none",
                              statusPillClass(f.status),
                            )}
                          >
                            {ITR_STATUSES.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={ITR_STATUS_TONE[f.status]}>{f.status}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && (
                            <button
                              onClick={() => {
                                setEditing(f);
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
                              onClick={() => setToDelete(f)}
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
        <FilingForm
          initial={editing}
          clients={clients ?? []}
          staff={staff ?? []}
          defaultFy={fy === "All" ? (fys[1] ?? fys[0]) : fy}
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
        title="Delete filing?"
        message={`The ${toDelete?.returnType} filing (FY ${toDelete?.financialYear}) for ${toDelete?.client?.name} will be removed.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/itr/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function FilingForm({
  initial,
  clients,
  staff,
  defaultFy,
  onClose,
  onSaved,
}: {
  initial: ItrFiling | null;
  clients: Client[];
  staff: Staff[];
  defaultFy: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? {
      returnType: "ITR",
      financialYear: defaultFy,
      formType: "ITR-1",
      regime: "New",
      status: "Documents Awaited",
    },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string | number | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  const rt = form.returnType ?? "ITR";
  const formOptions = filingFormOptions(rt);
  const taxYear = rt === "ITR" || rt === "TDS";
  const showQuarter = rt === "TDS" || rt === "GST";
  const showMonth = rt === "GST";

  function setReturnType(v: string) {
    setForm((f) => ({
      ...f,
      returnType: v,
      formType: filingFormOptions(v)[0] ?? "",
      periodQuarter: null,
      periodMonth: null,
    }));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        clientId: form.clientId,
        returnType: rt,
        financialYear: form.financialYear,
        formType: form.formType,
        regime: form.regime ?? "New",
        periodQuarter: showQuarter ? form.periodQuarter || null : null,
        periodMonth: showMonth ? (form.periodMonth ?? null) : null,
        status: form.status,
        filedOn: form.filedOn || null,
        ackNumber: form.ackNumber,
        refundAmount: form.refundAmount ?? null,
        assigneeId: form.assigneeId || null,
        notes: form.notes,
      };
      if (isEdit) await apiMutate(`/api/itr/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/itr", "POST", payload);
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
      title={isEdit ? "Edit Filing" : "New Filing"}
      description="A return-filing register entry — ITR, TDS, GST or MCA."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.clientId || !form.financialYear}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create filing"}
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
        <Field label="Client" required>
          <Select value={form.clientId ?? ""} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Return type" required>
          <Select value={rt} onChange={(e) => setReturnType(e.target.value)}>
            {RETURN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Form">
          <Select value={form.formType ?? ""} onChange={(e) => set("formType", e.target.value)}>
            {formOptions.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Financial year"
          required
          hint={
            form.financialYear && /^\d{4}-\d{2}$/.test(form.financialYear) && taxYear
              ? `Income-tax year: ${incomeTaxYearLabel(form.financialYear)}`
              : "e.g. 2025-26"
          }
        >
          <Input
            value={form.financialYear ?? ""}
            onChange={(e) => set("financialYear", e.target.value)}
            placeholder="2025-26"
          />
        </Field>
        {showQuarter && (
          <Field label="Quarter" hint={rt === "GST" ? "For quarterly returns" : undefined}>
            <Select
              value={form.periodQuarter ?? ""}
              onChange={(e) => set("periodQuarter", e.target.value || null)}
            >
              <option value="">— None —</option>
              {QUARTERS.map((qk) => (
                <option key={qk} value={qk}>
                  {QUARTER_LABELS[qk]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {showMonth && (
          <Field label="Month" hint="For monthly returns">
            <Select
              value={form.periodMonth ? String(form.periodMonth) : ""}
              onChange={(e) => set("periodMonth", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {rt === "ITR" && (
          <Field label="Tax regime">
            <Select value={form.regime ?? ""} onChange={(e) => set("regime", e.target.value)}>
              {ITR_REGIMES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Status">
          <Select value={form.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            {ITR_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select value={form.assigneeId ?? ""} onChange={(e) => set("assigneeId", e.target.value)}>
            <option value="">— Unassigned —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Filed on">
          <Input
            type="date"
            value={toDateInput(form.filedOn)}
            onChange={(e) => set("filedOn", e.target.value)}
          />
        </Field>
        <Field label="Acknowledgement no.">
          <Input
            value={form.ackNumber ?? ""}
            onChange={(e) => set("ackNumber", e.target.value)}
          />
        </Field>
        {rt === "ITR" && (
          <Field label="Refund amount (₹)" hint="Leave blank if none">
            <Input
              type="number"
              min={0}
              value={form.refundAmount ?? ""}
              onChange={(e) => set("refundAmount", e.target.value)}
            />
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
