"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Pencil, Trash2, Receipt, FileDown, FileCheck2, Mail, IndianRupee, BookOpenCheck } from "lucide-react";
import { ReceiptRegisterPanel } from "@/components/ReceiptRegister";
import { useResource, useDebounced, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Invoice, Client, Organization, Task } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import {
  INVOICE_STATUSES,
  GST_MODES,
  GST_MODE_LABELS,
  PAYMENT_MODES,
  ELECTRONIC_MODES,
} from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  toDateInput,
  invoiceGross,
  cn,
} from "@/lib/format";

const withTax = (i: { amount: number; taxRate: number; gstMode?: string }) =>
  invoiceGross(i.amount, i.taxRate, i.gstMode);

// A short summary of an invoice's billed services (line items, else its note).
function servicesSummary(i: Invoice): string {
  if (i.lineItems && i.lineItems.length > 0) return i.lineItems.map((l) => l.description).join(", ");
  return i.description ?? "";
}
// How many line items are mapped to a task.
function billedTaskCount(i: Invoice): number {
  return (i.lineItems ?? []).filter((l) => l.taskId).length;
}

type FormState = Partial<Invoice>;
type LineDraft = { id?: string; description: string; amount: number; taskId: string };

type Tab = "invoices" | "receipts";

export default function InvoicesPage() {
  const { can } = useAuth();
  const canManage = can("manageInvoices");
  // Billing lives in one module: raising invoices, and the firm-wise receipt
  // register of what was actually collected.
  const [tab, setTab] = useState<Tab>("invoices");
  useEffect(() => {
    // Deep link (/invoices?tab=receipts) — also used by the old /receipts URL.
    if (new URLSearchParams(window.location.search).get("tab") === "receipts") {
      setTab("receipts");
    }
  }, []);
  const [q, setQ] = useState("");
  const qd = useDebounced(q);
  const [status, setStatus] = useState("All");
  const url = `/api/invoices?q=${encodeURIComponent(qd)}&status=${status}`;
  const { data, loading, error, refresh, setData } = useResource<Invoice[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");
  const { data: orgs } = useResource<Organization[]>("/api/orgs");
  const { data: tasks } = useResource<Task[]>("/api/tasks");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [toDelete, setToDelete] = useState<Invoice | null>(null);
  // Invoice being marked Paid (or whose payment record is being edited).
  const [payFor, setPayFor] = useState<Invoice | null>(null);

  const all = data ?? [];
  const billed = all.reduce((s, i) => s + withTax(i), 0);
  const collected = all
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + withTax(i), 0);
  const outstanding = all
    .filter((i) => i.status === "Sent" || i.status === "Overdue")
    .reduce((s, i) => s + withTax(i), 0);

  async function quickStatus(inv: Invoice, s: string) {
    // Marking Paid captures the payment record first (mode, details, TDS).
    if (s === "Paid" && inv.status !== "Paid") {
      setPayFor(inv);
      return;
    }
    // Update the row in place — no full list refetch per status change.
    const updated = (await apiMutate(`/api/invoices/${inv.id}`, "PATCH", { status: s })) as Invoice;
    setData((list) =>
      list ? list.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)) : list,
    );
  }

  const [emailBusy, setEmailBusy] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function emailInvoice(inv: Invoice) {
    setEmailBusy(inv.id);
    setEmailMsg(null);
    try {
      const res = (await apiMutate(`/api/invoices/${inv.id}/email`, "POST")) as {
        status: string;
        to: string;
        live: boolean;
      };
      setEmailMsg(
        res.status === "Sent"
          ? { kind: "ok", text: `Invoice ${inv.invoiceNumber} emailed to ${res.to}.` }
          : {
              kind: "ok",
              text: `Invoice ${inv.invoiceNumber} email simulated (configure the firm email in Settings to send for real). Logged for ${res.to}.`,
            },
      );
      refresh();
    } catch (e) {
      setEmailMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not email the invoice" });
    } finally {
      setEmailBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={
          tab === "receipts"
            ? "Firm-wise receipt register — professional income on receipt basis"
            : "Professional fee billing and collections"
        }
        actions={
          tab === "invoices" && canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Invoice
            </Button>
          ) : undefined
        }
      />

      {/* One billing module: raising invoices + the register of receipts */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("invoices")}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
            tab === "invoices"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          <Receipt className="h-4 w-4" /> Invoices
        </button>
        <button
          onClick={() => setTab("receipts")}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
            tab === "receipts"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          <BookOpenCheck className="h-4 w-4" /> Receipt Register
        </button>
      </div>

      {tab === "receipts" ? (
        <ReceiptRegisterPanel />
      ) : (
        <>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile label="Total Billed" value={formatCurrency(billed)} tone="indigo" />
        <SummaryTile label="Collected" value={formatCurrency(collected)} tone="emerald" />
        <SummaryTile label="Outstanding" value={formatCurrency(outstanding)} tone="amber" />
      </div>

      {emailMsg && (
        <div
          className={`mb-4 rounded-lg px-4 py-2.5 text-xs ring-1 ${
            emailMsg.kind === "ok"
              ? "bg-fern-50 text-fern-800 ring-fern-200"
              : "bg-rose-50 text-rose-700 ring-rose-200"
          }`}
        >
          {emailMsg.text}
        </div>
      )}

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by number or description…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All statuses</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading invoices…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : all.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices found" message="Raise your first invoice to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Issued</th>
                  <th className="px-5 py-3">Due</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{i.invoiceNumber}</p>
                      {servicesSummary(i) && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                          {servicesSummary(i)}
                        </p>
                      )}
                      {billedTaskCount(i) > 0 && (
                        <p className="mt-0.5 text-[11px] text-fern-600">
                          {billedTaskCount(i)} task{billedTaskCount(i) === 1 ? "" : "s"} mapped
                        </p>
                      )}
                      {i.organization && (
                        <p className="mt-0.5 text-[11px] text-brand-500">
                          {i.organization.name}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {i.tradeName ? (
                        <>
                          <span className="text-slate-800">{i.tradeName.name}</span>
                          <span className="block text-[11px] text-slate-400">
                            {i.client?.name}
                          </span>
                        </>
                      ) : (
                        (i.client?.name ?? "—")
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(i.issueDate)}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(i.dueDate)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-medium text-slate-800">
                        {formatCurrency(withTax(i))}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {i.gstMode === "None" ? "No GST" : `incl. ${i.taxRate}% GST`}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {canManage ? (
                        <select
                          value={i.status}
                          onChange={(e) => quickStatus(i, e.target.value)}
                          className={cn(
                            "cursor-pointer rounded-full border-0 px-2 py-1 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-brand-300 focus:outline-none",
                            invoicePillClass(i.status),
                          )}
                        >
                          {INVOICE_STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
                            invoicePillClass(i.status),
                          )}
                        >
                          {i.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/invoices/${i.id}/pdf`}
                          target="_blank"
                          rel="noopener"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                          title="Invoice PDF"
                        >
                          <FileDown className="h-4 w-4" />
                        </a>
                        {i.status === "Paid" && (
                          <a
                            href={`/api/invoices/${i.id}/receipt`}
                            target="_blank"
                            rel="noopener"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title="Payment receipt PDF"
                          >
                            <FileCheck2 className="h-4 w-4" />
                          </a>
                        )}
                        {i.status === "Paid" && canManage && (
                          <button
                            onClick={() => setPayFor(i)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title={
                              i.paymentMode
                                ? `Payment: ${i.paymentMode}${i.tdsDeducted ? ` · TDS ${formatCurrency(i.tdsDeducted)}` : ""}`
                                : "Record payment details"
                            }
                          >
                            <IndianRupee className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button
                              onClick={() => emailInvoice(i)}
                              disabled={emailBusy === i.id}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                              title={
                                i.client?.email
                                  ? `Email invoice to ${i.client.email}`
                                  : "Email invoice (client has no email on record)"
                              }
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditing(i);
                                setFormOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setToDelete(i)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
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
        <InvoiceForm
          initial={editing}
          clients={clients ?? []}
          orgs={orgs ?? []}
          tasks={tasks ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {payFor && (
        <PaymentModal
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete invoice?"
        message={`Invoice ${toDelete?.invoiceNumber} will be permanently removed.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/invoices/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "indigo" | "emerald" | "amber";
}) {
  const ring = {
    indigo: "border-l-brand-500",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
  }[tone];
  return (
    <div className={cn("rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm", ring)}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function invoicePillClass(status: string) {
  switch (status) {
    case "Paid":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    case "Sent":
      return "bg-blue-100 text-blue-700 ring-blue-200";
    case "Overdue":
      return "bg-rose-100 text-rose-700 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function InvoiceForm({
  initial,
  clients,
  orgs,
  tasks,
  onClose,
  onSaved,
}: {
  initial: Invoice | null;
  clients: Client[];
  orgs: Organization[];
  tasks: Task[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultOrgId = orgs.find((o) => o.isDefault)?.id ?? orgs[0]?.id ?? "";
  const [form, setForm] = useState<FormState>(
    initial ?? {
      invoiceNumber: "",
      taxRate: 18,
      gstMode: "Auto",
      status: "Draft",
      organizationId: defaultOrgId,
    },
  );
  const [lineItems, setLineItems] = useState<LineDraft[]>(() => {
    if (initial?.lineItems && initial.lineItems.length > 0) {
      return initial.lineItems.map((l) => ({
        id: l.id,
        description: l.description,
        amount: l.amount,
        taskId: l.taskId ?? "",
      }));
    }
    if (initial) {
      // Legacy invoice: seed a single line from its amount/description.
      return [{ description: initial.description ?? "", amount: initial.amount ?? 0, taskId: "" }];
    }
    return [{ description: "", amount: 0, taskId: "" }];
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const addLine = () => setLineItems((ls) => [...ls, { description: "", amount: 0, taskId: "" }]);
  const removeLine = (i: number) => setLineItems((ls) => ls.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof LineDraft, v: string | number) =>
    setLineItems((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: v } : l)));

  const rate = Number(form.taxRate) || 0;
  const gstMode = form.gstMode ?? "Auto";
  const subtotal = lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const total = withTax({ amount: subtotal, taxRate: rate, gstMode });

  const selectedClient = clients.find((c) => c.id === form.clientId);
  const tradeNames = selectedClient?.tradeNames ?? [];
  const clientTasks = form.clientId ? tasks.filter((t) => t.clientId === form.clientId) : [];

  const validLines = lineItems.filter((l) => l.description.trim());

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        invoiceNumber: form.invoiceNumber || null, // blank → auto-generated
        clientId: form.clientId,
        tradeNameId: form.tradeNameId || null,
        organizationId: form.organizationId || null,
        description: null,
        amount: subtotal,
        taxRate: rate,
        gstMode,
        status: form.status,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        lineItems: validLines.map((l) => ({
          id: l.id,
          description: l.description.trim(),
          amount: Number(l.amount) || 0,
          taskId: l.taskId || null,
        })),
      };
      if (isEdit) await apiMutate(`/api/invoices/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/invoices", "POST", payload);
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
      title={isEdit ? "Edit Invoice" : "New Invoice"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.clientId || validLines.length === 0}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create invoice"}
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
        <Field
          label="Invoice number"
          hint={isEdit ? undefined : "Leave blank to auto-generate (e.g. APSB/26-27/001)"}
        >
          <Input
            value={form.invoiceNumber ?? ""}
            onChange={(e) => set("invoiceNumber", e.target.value)}
            placeholder={isEdit ? "" : "Auto"}
          />
        </Field>
        <Field label="Client" required>
          <Select
            value={form.clientId ?? ""}
            onChange={(e) => {
              set("clientId", e.target.value);
              set("tradeNameId", ""); // reset bill-to when the client changes
            }}
          >
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {selectedClient && tradeNames.length > 0 && (
          <Field
            label="Bill to"
            hint="Raise this invoice under the client's legal name or a trade name"
            className="sm:col-span-2"
          >
            <Select value={form.tradeNameId ?? ""} onChange={(e) => set("tradeNameId", e.target.value)}>
              <option value="">{selectedClient.name} (legal name)</option>
              {tradeNames.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.gstin ? ` · GSTIN ${t.gstin}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {orgs.length > 0 && (
          <Field
            label="Billing organization"
            hint="The entity whose letterhead, GSTIN and bank appear on the PDF"
            className="sm:col-span-2"
          >
            <Select
              value={form.organizationId ?? ""}
              onChange={(e) => set("organizationId", e.target.value)}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.isDefault ? " (default)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* Service line items — bill several services on one invoice, each
            optionally mapped to the Task it settles. */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Services billed</span>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add service
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {lineItems.map((l, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <Input
                      value={l.description}
                      onChange={(e) => updateLine(i, "description", e.target.value)}
                      placeholder="Service, e.g. Statutory audit fee – FY 2025-26"
                    />
                  </div>
                  <div className="w-full sm:w-32">
                    <Input
                      type="number"
                      min={0}
                      value={l.amount}
                      onChange={(e) => updateLine(i, "amount", e.target.value)}
                      placeholder="Amount ₹"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={lineItems.length === 1}
                    className="mt-1 shrink-0 rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30"
                    title="Remove service"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Map to task</span>
                  <select
                    value={l.taskId}
                    onChange={(e) => updateLine(i, "taskId", e.target.value)}
                    disabled={!form.clientId}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-slate-50"
                  >
                    <option value="">— Not mapped —</option>
                    {clientTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end text-sm text-slate-600">
            Subtotal <span className="ml-2 font-semibold text-slate-900">{formatCurrency(subtotal)}</span>
          </div>
        </div>

        <Field label="GST applicability">
          <Select value={gstMode} onChange={(e) => set("gstMode", e.target.value)}>
            {GST_MODES.map((m) => (
              <option key={m} value={m}>
                {GST_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        {gstMode !== "None" && (
          <Field label="GST rate (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.taxRate ?? 18}
              onChange={(e) => set("taxRate", e.target.value)}
            />
          </Field>
        )}
        <Field label="Issue date">
          <Input
            type="date"
            value={toDateInput(form.issueDate)}
            onChange={(e) => set("issueDate", e.target.value)}
          />
        </Field>
        <Field label="Due date">
          <Input
            type="date"
            value={toDateInput(form.dueDate)}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={form.status ?? "Draft"} onChange={(e) => set("status", e.target.value)}>
            {INVOICE_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <div className="w-full rounded-lg bg-slate-50 px-4 py-2.5 text-right">
            <p className="text-[11px] text-slate-500">
              {gstMode === "None" ? "Total (no GST)" : "Total incl. GST"}
            </p>
            <p className="text-lg font-semibold text-slate-900">{formatCurrency(total)}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Record how an invoice was paid: mode + instrument details + any TDS the
// client deducted at source. Saving marks the invoice Paid.
function PaymentModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const gross = Math.round(withTax(invoice));
  const [mode, setMode] = useState(invoice.paymentMode ?? "NEFT/IMPS/Transfer");
  const [paidDate, setPaidDate] = useState(
    toDateInput(invoice.paidDate) || toDateInput(new Date().toISOString()),
  );
  const [chequeNumber, setChequeNumber] = useState(invoice.chequeNumber ?? "");
  const [chequeDate, setChequeDate] = useState(toDateInput(invoice.chequeDate));
  const [chequeBank, setChequeBank] = useState(invoice.chequeBank ?? "");
  const [transactionRef, setTransactionRef] = useState(invoice.transactionRef ?? "");
  const [tdsOn, setTdsOn] = useState((invoice.tdsDeducted ?? 0) > 0);
  const [tds, setTds] = useState(invoice.tdsDeducted ? String(invoice.tdsDeducted) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCheque = mode === "Cheque";
  const isElectronic = ELECTRONIC_MODES.has(mode);
  const tdsAmount = tdsOn ? parseFloat(tds) || 0 : 0;
  const net = Math.max(0, gross - tdsAmount);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await apiMutate(`/api/invoices/${invoice.id}`, "PATCH", {
        status: "Paid",
        paymentMode: mode,
        paidDate: paidDate || null,
        chequeNumber: isCheque ? chequeNumber || null : null,
        chequeDate: isCheque ? chequeDate || null : null,
        chequeBank: isCheque ? chequeBank || null : null,
        transactionRef: isElectronic ? transactionRef || null : null,
        tdsDeducted: tdsAmount > 0 ? tdsAmount : null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record payment — ${invoice.invoiceNumber}`}
      description={`${invoice.client?.name ?? ""} · ${formatCurrency(gross)} receivable. The details print on the receipt.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              busy ||
              (isCheque && !(chequeNumber && chequeDate && chequeBank)) ||
              (isElectronic && !transactionRef) ||
              (tdsOn && !(tdsAmount > 0))
            }
          >
            {busy ? "Saving…" : `Mark paid · ${formatCurrency(net)} received`}
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
        <Field label="Mode of payment" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment date" required hint="The receipt date">
          <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </Field>

        {isCheque && (
          <>
            <Field label="Cheque no." required>
              <Input
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
                placeholder="e.g. 004512"
              />
            </Field>
            <Field label="Cheque date" required>
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </Field>
            <Field label="Bank name" required className="sm:col-span-2">
              <Input
                value={chequeBank}
                onChange={(e) => setChequeBank(e.target.value)}
                placeholder="e.g. HDFC Bank, Fort branch"
              />
            </Field>
          </>
        )}
        {isElectronic && (
          <Field
            label="Transaction no."
            required
            className="sm:col-span-2"
            hint="UTR / UPI reference — printed on the receipt with the payment date"
          >
            <Input
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="e.g. UTR N123456789012345"
            />
          </Field>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={tdsOn}
              onChange={(e) => setTdsOn(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Client deducted TDS on the fee
          </label>
          {tdsOn && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="TDS amount (₹)" required hint="Deducted at source by the client">
                <Input
                  type="number"
                  min={0}
                  value={tds}
                  onChange={(e) => setTds(e.target.value)}
                  placeholder="e.g. 4500"
                />
              </Field>
              <div className="flex items-end">
                <div className="w-full rounded-lg bg-white px-4 py-2.5 text-right ring-1 ring-slate-200">
                  <p className="text-[11px] text-slate-500">Net received (gross − TDS)</p>
                  <p className="text-lg font-semibold text-slate-900">{formatCurrency(net)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
