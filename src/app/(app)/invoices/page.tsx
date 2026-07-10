"use client";

import { useState } from "react";
import { Search, Plus, Pencil, Trash2, Receipt, FileDown, FileCheck2 } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Invoice, Client, Organization } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { INVOICE_STATUSES, GST_MODES, GST_MODE_LABELS } from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  toDateInput,
  invoiceGross,
  cn,
} from "@/lib/format";

const withTax = (i: { amount: number; taxRate: number; gstMode?: string }) =>
  invoiceGross(i.amount, i.taxRate, i.gstMode);
type FormState = Partial<Invoice>;

export default function InvoicesPage() {
  const { can } = useAuth();
  const canManage = can("manageInvoices");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const url = `/api/invoices?q=${encodeURIComponent(q)}&status=${status}`;
  const { data, loading, error, refresh } = useResource<Invoice[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");
  const { data: orgs } = useResource<Organization[]>("/api/orgs");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [toDelete, setToDelete] = useState<Invoice | null>(null);

  const all = data ?? [];
  const billed = all.reduce((s, i) => s + withTax(i), 0);
  const collected = all
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + withTax(i), 0);
  const outstanding = all
    .filter((i) => i.status === "Sent" || i.status === "Overdue")
    .reduce((s, i) => s + withTax(i), 0);

  async function quickStatus(inv: Invoice, s: string) {
    await apiMutate(`/api/invoices/${inv.id}`, "PATCH", { status: s });
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Professional fee billing and collections"
        actions={
          canManage ? (
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

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile label="Total Billed" value={formatCurrency(billed)} tone="indigo" />
        <SummaryTile label="Collected" value={formatCurrency(collected)} tone="emerald" />
        <SummaryTile label="Outstanding" value={formatCurrency(outstanding)} tone="amber" />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by number or description…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
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
                      {i.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                          {i.description}
                        </p>
                      )}
                      {i.organization && (
                        <p className="mt-0.5 text-[11px] text-indigo-500">
                          {i.organization.name}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{i.client?.name ?? "—"}</td>
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
                            "cursor-pointer rounded-full border-0 px-2 py-1 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-indigo-300 focus:outline-none",
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
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
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
                        {canManage && (
                          <>
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
        title="Delete invoice?"
        message={`Invoice ${toDelete?.invoiceNumber} will be permanently removed.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/invoices/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
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
    indigo: "border-l-indigo-500",
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
  onClose,
  onSaved,
}: {
  initial: Invoice | null;
  clients: Client[];
  orgs: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const suggested = `INV-2627-${String(Math.floor(Math.random() * 900) + 100)}`;
  const defaultOrgId = orgs.find((o) => o.isDefault)?.id ?? orgs[0]?.id ?? "";
  const [form, setForm] = useState<FormState>(
    initial ?? {
      invoiceNumber: suggested,
      taxRate: 18,
      gstMode: "Auto",
      status: "Draft",
      amount: 0,
      organizationId: defaultOrgId,
    },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const amount = Number(form.amount) || 0;
  const rate = Number(form.taxRate) || 0;
  const gstMode = form.gstMode ?? "Auto";
  const total = withTax({ amount, taxRate: rate, gstMode });

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        invoiceNumber: form.invoiceNumber,
        clientId: form.clientId,
        organizationId: form.organizationId || null,
        description: form.description,
        amount,
        taxRate: rate,
        gstMode,
        status: form.status,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
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
          <Button onClick={submit} disabled={busy || !form.invoiceNumber || !form.clientId}>
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
        <Field label="Invoice number" required>
          <Input
            value={form.invoiceNumber ?? ""}
            onChange={(e) => set("invoiceNumber", e.target.value)}
          />
        </Field>
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
        <Field label="Description" className="sm:col-span-2">
          <Input
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="e.g. Statutory audit fee – FY 2025-26"
          />
        </Field>
        <Field label="Fee amount (₹)" required>
          <Input
            type="number"
            min={0}
            value={form.amount ?? 0}
            onChange={(e) => set("amount", e.target.value)}
          />
        </Field>
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
