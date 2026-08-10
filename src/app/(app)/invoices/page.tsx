"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Pencil, Trash2, Receipt, FileDown, FileCheck2, Mail, IndianRupee, BookOpenCheck, MessageCircle, Lock } from "lucide-react";
import { WhatsappModal } from "@/components/WhatsappModal";
import { PdfViewer } from "@/components/PdfViewer";
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
  INVOICE_STATUSES_SETTABLE,
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

// One of the two documents an invoice produces — the bill itself, or the
// receipt once it is paid. The viewer and the WhatsApp sender both work on
// either, so they travel together as one target.
type DocTarget = { invoice: Invoice; kind: "invoice" | "receipt" };

const invoiceLabel = (i: Invoice) =>
  i.kind === "Reimbursement" ? "Reimbursement bill" : "Invoice";

function docTitle(t: DocTarget): string {
  return t.kind === "receipt"
    ? `Receipt for ${t.invoice.invoiceNumber}`
    : `${invoiceLabel(t.invoice)} ${t.invoice.invoiceNumber}`;
}
function docSrc(t: DocTarget): string {
  return `/api/invoices/${t.invoice.id}/${t.kind === "receipt" ? "receipt" : "pdf"}`;
}
function docFilename(t: DocTarget): string {
  const base = t.invoice.invoiceNumber.replace(/\//g, "-");
  return t.kind === "receipt" ? `Receipt-${base}.pdf` : `${base}.pdf`;
}

/** The covering note that goes with the document on WhatsApp. */
function docMessage(t: DocTarget): string {
  const { invoice: i } = t;
  const greeting = `Dear ${i.client?.contactPerson || i.client?.name || "Sir/Madam"},`;
  const sign = `\n\nRegards,\n${i.organization?.name ?? ""}`;
  if (t.kind === "receipt") {
    return (
      `${greeting}\n\nPlease find the receipt for ${invoiceLabel(i).toLowerCase()} ${i.invoiceNumber} ` +
      `dated ${formatDate(i.issueDate)} for ${formatCurrency(withTax(i))}, received with thanks.${sign}`
    );
  }
  return (
    `${greeting}\n\n${invoiceLabel(i)} ${i.invoiceNumber} ` +
    `dated ${formatDate(i.issueDate)} for ${formatCurrency(withTax(i))} ` +
    `${i.status === "Paid" ? "has been received with thanks." : "is due for payment."}` +
    `${i.dueDate && i.status !== "Paid" ? ` Due date: ${formatDate(i.dueDate)}.` : ""}${sign}`
  );
}

// A short summary of an invoice's billed services (line items, else its note).
function servicesSummary(i: Invoice): string {
  if (i.lineItems && i.lineItems.length > 0) return i.lineItems.map((l) => l.description).join(", ");
  return i.description ?? "";
}
// Where a bill stands: what it is worth, what has come in, what is still due.
// A client rarely settles a professional-fee invoice in one go.
function settlement(i: Invoice) {
  const gross = withTax(i);
  const received = (i.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
  return {
    gross,
    received,
    outstanding: Math.max(0, gross - received),
    partly: received > 0.5 && received < gross - 0.5,
    anyReceived: received > 0.5,
  };
}

// How many line items are mapped to a task.
function billedTaskCount(i: Invoice): number {
  const ids = new Set<string>();
  for (const l of i.lineItems ?? []) {
    for (const t of l.tasks ?? []) ids.add(t.id);
    if (l.taskId) ids.add(l.taskId);
  }
  return ids.size;
}

type FormState = Partial<Invoice>;
// A service line can settle several engagements, so tasks are a set.
type LineDraft = { id?: string; description: string; amount: number; taskIds: string[] };

type Tab = "invoices" | "receipts";

export default function InvoicesPage() {
  const { can } = useAuth();
  const canView = can("viewInvoices");
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
  // Fee bills vs expense reimbursement bills (separate number series).
  const [kindFilter, setKindFilter] = useState("All");
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
  // The document being sent on WhatsApp, and the one open in the viewer —
  // either the invoice itself or its payment receipt.
  const [waFor, setWaFor] = useState<DocTarget | null>(null);
  const [viewing, setViewing] = useState<DocTarget | null>(null);

  const all = (data ?? []).filter(
    (i) => kindFilter === "All" || (i.kind ?? "Fee") === kindFilter,
  );
  const billed = all.reduce((s, i) => s + withTax(i), 0);
  // Collected counts the money actually received, so a part payment shows up
  // the day it comes in rather than only when the bill is finally settled.
  const collected = all.reduce((s, i) => s + settlement(i).received, 0);
  const outstanding = all
    .filter((i) => i.status !== "Draft")
    .reduce((s, i) => s + settlement(i).outstanding, 0);

  async function quickStatus(inv: Invoice, s: string) {
    // Marking Paid captures the receipt first (amount, mode, details, TDS).
    if (s === "Paid" && settlement(inv).outstanding > 0.5) {
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

  // Billing is partner-level: someone who reaches this URL without the
  // permission is told so plainly rather than shown an empty register.
  if (!canView) {
    return (
      <div>
        <PageHeader title="Invoices" subtitle="Professional fee billing and collections" />
        <Card>
          <EmptyState
            icon={Lock}
            title="Billing is restricted"
            message="Invoices, receipts and the firm's billing figures are visible to partners and admins. Ask a partner if you need access — it can be granted per role in Access Control."
          />
        </Card>
      </div>
    );
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
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All types</option>
            <option value="Fee">Professional fees</option>
            <option value="Reimbursement">Reimbursements</option>
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
                      {i.kind === "Reimbursement" && (
                        <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
                          Expense reimbursement
                        </span>
                      )}
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
                      {/* Part-settled: say how much has come in and how much
                          is still owed, which is the whole point of the row. */}
                      {settlement(i).partly && (
                        <span className="mt-0.5 block text-[11px] font-medium text-amber-700">
                          {formatCurrency(settlement(i).received)} received ·{" "}
                          {formatCurrency(settlement(i).outstanding)} due
                        </span>
                      )}
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
                          {/* Partly Paid and Paid follow from the receipts, so
                              they are only listed when they already apply. */}
                          {INVOICE_STATUSES.filter(
                            (s) =>
                              s === i.status ||
                              s === "Paid" ||
                              (INVOICE_STATUSES_SETTABLE as readonly string[]).includes(s),
                          ).map((s) => (
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
                        {/* PDFs open inside the app, so there is always a way
                            back and a way to share them. */}
                        <button
                          onClick={() => setViewing({ invoice: i, kind: "invoice" })}
                          data-testid={`open-invoice-${i.invoiceNumber}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                          title="Open the invoice PDF"
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        {settlement(i).anyReceived && (
                          <button
                            onClick={() => setViewing({ invoice: i, kind: "receipt" })}
                            data-testid={`open-receipt-${i.invoiceNumber}`}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title={
                              (i.payments?.length ?? 0) > 1
                                ? `Open the latest of ${i.payments!.length} receipts`
                                : "Open the payment receipt PDF"
                            }
                          >
                            <FileCheck2 className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && (i.status !== "Draft" || settlement(i).anyReceived) && (
                          <button
                            onClick={() => setPayFor(i)}
                            data-testid={`payments-${i.invoiceNumber}`}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title={
                              settlement(i).outstanding > 0.5
                                ? `Record a payment · ${formatCurrency(settlement(i).outstanding)} outstanding`
                                : "Payments received"
                            }
                          >
                            <IndianRupee className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setWaFor({ invoice: i, kind: "invoice" })}
                          disabled={!i.client?.phone}
                          data-testid={`wa-invoice-${i.invoiceNumber}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30"
                          title={
                            i.client?.phone
                              ? `Send the invoice PDF to ${i.client.name} on WhatsApp`
                              : "Client has no phone number on record"
                          }
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
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
          onSaved={(saved) => {
            setPayFor(null);
            // The receipt is emailed to the client automatically — report
            // whether it went out, or why it did not.
            const r = saved.receiptEmail;
            if (r) {
              setEmailMsg(
                r.status === "Sent"
                  ? { kind: "ok", text: `Receipt ${saved.receiptNumber} emailed to ${r.to}.` }
                  : r.status === "Simulated"
                    ? {
                        kind: "ok",
                        text: `Receipt ${saved.receiptNumber} email simulated for ${r.to} (configure the firm email in Settings to send for real).`,
                      }
                    : {
                        kind: "err",
                        text: `Payment recorded, but the receipt was not emailed: ${r.reason ?? "delivery failed"}.`,
                      },
              );
            }
            refresh();
          }}
        />
      )}

      {viewing && (
        <PdfViewer
          src={docSrc(viewing)}
          title={docTitle(viewing)}
          filename={docFilename(viewing)}
          onWhatsapp={
            viewing.invoice.client?.phone
              ? () => {
                  const target = viewing;
                  setViewing(null);
                  setWaFor(target);
                }
              : undefined
          }
          onClose={() => setViewing(null)}
        />
      )}

      {waFor && (
        <WhatsappModal
          to={waFor.invoice.client?.phone}
          recipientName={waFor.invoice.client?.name}
          recipientType="Client"
          title={`Send ${docTitle(waFor)} on WhatsApp`}
          message={docMessage(waFor)}
          document={{
            invoiceId: waFor.invoice.id,
            kind: waFor.kind,
            src: docSrc(waFor),
          }}
          onClose={() => setWaFor(null)}
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
        taskIds: l.tasks?.length ? l.tasks.map((t) => t.id) : l.taskId ? [l.taskId] : [],
      }));
    }
    if (initial) {
      // Legacy invoice: seed a single line from its amount/description.
      return [{ description: initial.description ?? "", amount: initial.amount ?? 0, taskIds: [] }];
    }
    return [{ description: "", amount: 0, taskIds: [] }];
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Offer the whole group's work, not just the billed client's. On an existing
  // invoice it starts on if any mapped task belongs to somebody else, so the
  // tasks already billed stay visible when the invoice is reopened.
  const [groupScope, setGroupScope] = useState(() => {
    if (!initial) return false;
    const mapped = new Set(
      (initial.lineItems ?? []).flatMap((l) => [
        ...(l.tasks ?? []).map((t) => t.id),
        ...(l.taskId ? [l.taskId] : []),
      ]),
    );
    return tasks.some((t) => mapped.has(t.id) && t.clientId !== initial.clientId);
  });
  const [taskSearch, setTaskSearch] = useState("");
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const addLine = () => setLineItems((ls) => [...ls, { description: "", amount: 0, taskIds: [] }]);
  const removeLine = (i: number) => setLineItems((ls) => ls.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof LineDraft, v: string | number | string[]) =>
    setLineItems((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: v } : l)));
  // Tick a task on/off for a service line (a line can bill several tasks).
  const toggleLineTask = (i: number, taskId: string) =>
    setLineItems((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? {
              ...l,
              taskIds: l.taskIds.includes(taskId)
                ? l.taskIds.filter((t) => t !== taskId)
                : [...l.taskIds, taskId],
            }
          : l,
      ),
    );

  const rate = Number(form.taxRate) || 0;
  const gstMode = form.gstMode ?? "Auto";
  const subtotal = lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const total = withTax({ amount: subtotal, taxRate: rate, gstMode });

  const selectedClient = clients.find((c) => c.id === form.clientId);
  const tradeNames = selectedClient?.tradeNames ?? [];

  // One invoice often settles the work of a whole group — the family or
  // business group is billed through one of its entities. So the task picker
  // can widen from this client to every client in their group.
  const groupId = selectedClient?.groupId ?? null;
  const groupClients = groupId ? clients.filter((c) => c.groupId === groupId) : [];
  const canBillGroup = groupClients.length > 1;
  const billedClientIds =
    canBillGroup && groupScope
      ? groupClients.map((c) => c.id)
      : form.clientId
        ? [form.clientId]
        : [];
  const nameById = new Map(clients.map((c) => [c.id, c.name]));

  // Which invoice, if any, already bills a task — billing across a group makes
  // it far easier to bill the same engagement twice by mistake.
  const billedOn = (t: Task) =>
    [...(t.invoiceLines ?? []), ...(t.billedLines ?? [])]
      .map((l) => l.invoice?.invoiceNumber)
      .find((n) => !!n && n !== initial?.invoiceNumber) ?? null;

  const q = taskSearch.trim().toLowerCase();
  const clientTasks = tasks
    .filter((t) => !!t.clientId && billedClientIds.includes(t.clientId))
    .filter(
      (t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (nameById.get(t.clientId ?? "") ?? "").toLowerCase().includes(q),
    )
    // Group a mixed list by client so it reads as one client's work at a time.
    .sort((a, b) => {
      const byClient = (nameById.get(a.clientId ?? "") ?? "").localeCompare(
        nameById.get(b.clientId ?? "") ?? "",
      );
      return byClient !== 0 ? byClient : a.title.localeCompare(b.title);
    });

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
        kind: form.kind || "Fee",
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        lineItems: validLines.map((l) => ({
          id: l.id,
          description: l.description.trim(),
          amount: Number(l.amount) || 0,
          taskId: l.taskIds[0] || null,
          taskIds: l.taskIds,
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
        <Field
          label="Invoice type"
          hint={
            isEdit
              ? "Fixed once created — the number series differs per type"
              : "Reimbursements use their own EXP series and stay out of the fee receipt register"
          }
        >
          <Select
            value={form.kind ?? "Fee"}
            onChange={(e) => set("kind", e.target.value)}
            disabled={isEdit}
          >
            <option value="Fee">Professional fees</option>
            <option value="Reimbursement">Expense reimbursement</option>
          </Select>
        </Field>
        <Field label="Client" required>
          <Select
            value={form.clientId ?? ""}
            onChange={(e) => {
              set("clientId", e.target.value);
              set("tradeNameId", ""); // reset bill-to when the client changes
              // Another client's work is not this one's — drop the mappings
              // rather than silently bill someone else's tasks.
              setGroupScope(false);
              setTaskSearch("");
              setLineItems((ls) => ls.map((l) => ({ ...l, taskIds: [] })));
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
                {/* One service line can settle several engagements — tick
                    every task this line bills. */}
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Map to task{l.taskIds.length > 1 ? `s · ${l.taskIds.length} selected` : ""}
                    </span>
                    {l.taskIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => updateLine(i, "taskIds", [])}
                        className="text-[11px] text-slate-500 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {!form.clientId ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Select a client to map this service to their tasks.
                    </p>
                  ) : (
                    <>
                      {/* One bill for the whole family or business group. */}
                      {canBillGroup && (
                        <label className="mt-1 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={groupScope}
                            onChange={(e) => setGroupScope(e.target.checked)}
                            data-testid="bill-whole-group"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          Also offer the work of the{" "}
                          {groupClients.length === 2
                            ? "other client"
                            : `other ${groupClients.length - 1} clients`}{" "}
                          in{" "}
                          <span className="font-medium">
                            {selectedClient?.group?.name ?? "this group"}
                          </span>
                        </label>
                      )}
                      {clientTasks.length === 0 && !q ? (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {groupScope ? "This group has" : "This client has"} no tasks to map.
                        </p>
                      ) : (
                        <>
                          {/* A whole group's work is a long list to scroll. */}
                          {(clientTasks.length > 8 || q) && (
                            <input
                              value={taskSearch}
                              onChange={(e) => setTaskSearch(e.target.value)}
                              placeholder="Search tasks by title, service or client…"
                              data-testid="task-map-search"
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                            />
                          )}
                          <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5">
                            {clientTasks.length === 0 && (
                              <p className="px-1.5 py-1 text-[11px] text-slate-400">
                                No task matches “{taskSearch}”.
                              </p>
                            )}
                            {clientTasks.map((t) => {
                              const already = billedOn(t);
                              return (
                                <label
                                  key={t.id}
                                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={l.taskIds.includes(t.id)}
                                    onChange={() => toggleLineTask(i, t.id)}
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                  />
                                  <span>
                                    {t.title} · {t.category}
                                    {/* Whose work it is — essential once the
                                        list spans several clients. */}
                                    {billedClientIds.length > 1 && (
                                      <span className="block text-[11px] text-slate-500">
                                        {nameById.get(t.clientId ?? "") ?? "—"}
                                        {t.tradeName?.name ? ` · ${t.tradeName.name}` : ""}
                                      </span>
                                    )}
                                    {already && (
                                      <span className="block text-[11px] text-amber-700">
                                        Already billed on {already}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  )}
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
  onSaved: (saved: Invoice) => void;
}) {
  const { gross, received, outstanding } = settlement(invoice);
  const payments = invoice.payments ?? [];
  const [mode, setMode] = useState("NEFT/IMPS/Transfer");
  const [paidDate, setPaidDate] = useState(toDateInput(new Date().toISOString()));
  // Part payment: the client settles what they can now, the rest later. The
  // field starts at the full balance, which is what most receipts will be.
  const [amount, setAmount] = useState(outstanding > 0 ? String(Math.round(outstanding)) : "");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [note, setNote] = useState("");
  const [tdsOn, setTdsOn] = useState(false);
  const [tds, setTds] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCheque = mode === "Cheque";
  const isElectronic = ELECTRONIC_MODES.has(mode);
  const settling = Math.max(0, parseFloat(amount) || 0);
  const tdsAmount = tdsOn ? parseFloat(tds) || 0 : 0;
  const net = Math.max(0, settling - tdsAmount);
  const balanceAfter = Math.max(0, outstanding - settling);
  const overpaying = settling > outstanding + 1;
  const settled = outstanding <= 0.5;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiMutate(`/api/invoices/${invoice.id}/payments`, "POST", {
        amount: settling,
        paymentMode: mode,
        paidDate: paidDate || null,
        chequeNumber: isCheque ? chequeNumber || null : null,
        chequeDate: isCheque ? chequeDate || null : null,
        chequeBank: isCheque ? chequeBank || null : null,
        transactionRef: isElectronic ? transactionRef || null : null,
        tdsDeducted: tdsAmount > 0 ? tdsAmount : null,
        note: note || null,
      })) as { invoice: Invoice };
      onSaved(res.invoice);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record the payment");
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(paymentId: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiMutate(
        `/api/invoices/${invoice.id}/payments/${paymentId}`,
        "DELETE",
      )) as { invoice: Invoice };
      onSaved(res.invoice);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to remove the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Payments — ${invoice.invoiceNumber}`}
      description={
        settled
          ? `${invoice.client?.name ?? ""} · ${formatCurrency(gross)} received in full.`
          : `${invoice.client?.name ?? ""} · ${formatCurrency(outstanding)} of ${formatCurrency(gross)} still outstanding. Each payment gets its own receipt.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {!settled && (
            <Button
              onClick={submit}
              data-testid="save-payment"
              disabled={
                busy ||
                !(settling > 0) ||
                overpaying ||
                tdsAmount > settling ||
                (isCheque && !(chequeNumber && chequeDate && chequeBank)) ||
                (isElectronic && !transactionRef) ||
                (tdsOn && !(tdsAmount > 0))
              }
            >
              {busy
                ? "Saving…"
                : balanceAfter > 0.5
                  ? `Record ${formatCurrency(net)} on account`
                  : `Record ${formatCurrency(net)} · settles the bill`}
            </Button>
          )}
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      {/* What has already come in, each with its own receipt. */}
      {payments.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-medium text-slate-500">
                <th className="px-3 py-2">Receipt</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2 text-right">Settled</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} data-testid={`payment-row-${p.receiptNumber ?? p.id}`}>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {p.receiptNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{formatDate(p.paidDate)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {p.paymentMode ?? "—"}
                    {p.note && (
                      <span className="block text-[11px] text-slate-400">{p.note}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(p.amount - (p.tdsDeducted ?? 0))}
                    {(p.tdsDeducted ?? 0) > 0 && (
                      <span className="block text-[11px] text-slate-400">
                        TDS {formatCurrency(p.tdsDeducted!)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/invoices/${invoice.id}/receipt?payment=${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                        title="Open this receipt"
                      >
                        <FileCheck2 className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removePayment(p.id)}
                        disabled={busy}
                        data-testid={`undo-payment-${p.receiptNumber ?? p.id}`}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                        title="Remove this receipt — entered in error, or a cheque returned"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/70 text-xs">
                <td className="px-3 py-2 font-medium text-slate-600" colSpan={3}>
                  {formatCurrency(received)} of {formatCurrency(gross)} received
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800" colSpan={3}>
                  {outstanding > 0.5
                    ? `${formatCurrency(outstanding)} outstanding`
                    : "Settled in full"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {settled ? (
        <p className="rounded-lg bg-fern-50 px-3 py-2 text-sm text-fern-800 ring-1 ring-fern-200">
          This invoice has been received in full. Remove a receipt above if one was
          recorded in error.
        </p>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Amount received (₹)"
          required
          hint={`Up to ${formatCurrency(outstanding)} outstanding — enter less for a payment on account`}
        >
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="payment-amount"
          />
        </Field>
        <div className="flex items-end">
          <div
            className={cn(
              "w-full rounded-lg px-4 py-2.5 text-right ring-1",
              balanceAfter > 0.5
                ? "bg-amber-50 ring-amber-200"
                : "bg-fern-50 ring-fern-200",
            )}
          >
            <p className="text-[11px] text-slate-500">
              {balanceAfter > 0.5 ? "Balance after this payment" : "Settles the invoice"}
            </p>
            <p className="text-lg font-semibold text-slate-900" data-testid="balance-after">
              {formatCurrency(balanceAfter)}
            </p>
          </div>
        </div>
        {overpaying && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200 sm:col-span-2">
            That is more than the {formatCurrency(outstanding)} still outstanding on this
            invoice.
          </p>
        )}
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
              <Field
                label="TDS amount (₹)"
                required
                hint="Deducted at source out of this payment"
              >
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
                  <p className="text-[11px] text-slate-500">Cash received (settled − TDS)</p>
                  <p className="text-lg font-semibold text-slate-900">{formatCurrency(net)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Field
          label="Note"
          className="sm:col-span-2"
          hint="Optional — e.g. “part payment on account, balance after filing”"
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      )}
    </Modal>
  );
}
