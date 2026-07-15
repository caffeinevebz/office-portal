"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Hourglass,
  BadgeCheck,
  Receipt,
  X,
  Check,
  IndianRupee,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { ExpenseClaim, ExpenseItem, Client, Task } from "@/lib/types";
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
  EXPENSE_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUS_TONE,
} from "@/lib/constants";
import { formatCurrency, formatDate, toDateInput } from "@/lib/format";

function periodLabel(c: ExpenseClaim): string {
  if (c.periodFrom && c.periodTo)
    return `${formatDate(c.periodFrom)} – ${formatDate(c.periodTo)}`;
  if (c.periodFrom) return `from ${formatDate(c.periodFrom)}`;
  if (c.periodTo) return `until ${formatDate(c.periodTo)}`;
  return "";
}

export default function ExpensesPage() {
  const { can, user } = useAuth();
  const canApprove = can("approveExpenses");

  const [status, setStatus] = useState("All");
  const url = `/api/expenses?status=${encodeURIComponent(status)}`;
  const { data, loading, error, refresh } = useResource<ExpenseClaim[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");
  const { data: tasks } = useResource<Task[]>("/api/tasks");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseClaim | null>(null);
  const [toDelete, setToDelete] = useState<ExpenseClaim | null>(null);
  const [deciding, setDeciding] = useState<ExpenseClaim | null>(null);
  const [billing, setBilling] = useState<ExpenseClaim | null>(null);

  const all = data ?? [];
  const pending = all.filter((c) => c.status === "Pending");
  const approved = all.filter((c) => c.status === "Approved");
  const unbilled = approved.filter((c) => !c.invoiceId);
  const claimed = all
    .filter((c) => c.status !== "Rejected")
    .reduce((s, c) => s + c.totalAmount, 0);

  async function billClaim(c: ExpenseClaim) {
    await apiMutate(`/api/expenses/${c.id}/invoice`, "POST");
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Reimbursements"
        subtitle={
          canApprove
            ? "Expense claims from the team — approve them and bill the client"
            : "Claim back conveyance & other expenses from your audit assignments"
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Claim
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting approval"
          value={pending.length}
          icon={Hourglass}
          accent={pending.length > 0 ? "amber" : "emerald"}
          hint={canApprove && pending.length > 0 ? "Needs your decision" : undefined}
        />
        <StatCard label="Approved" value={approved.length} icon={BadgeCheck} accent="emerald" />
        <StatCard
          label="Approved, not yet billed"
          value={unbilled.length}
          icon={Receipt}
          accent={unbilled.length > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Total claimed"
          value={formatCurrency(claimed)}
          icon={IndianRupee}
          accent="indigo"
          hint="Pending + approved claims"
        />
      </div>

      <Card className="mb-4">
        <div className="flex items-center gap-3 p-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All statuses</option>
            {EXPENSE_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {!canApprove && (
            <p className="text-xs text-slate-500">
              Your claims go to a Partner/Admin for approval.
            </p>
          )}
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading claims…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : all.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No reimbursement claims"
            message="Raise a claim for conveyance or other expenses incurred during an audit assignment."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Claim</th>
                  <th className="px-5 py-3">Client / task</th>
                  <th className="px-5 py-3">Expenses</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((c) => {
                  const own = c.staffId === user?.id;
                  const period = periodLabel(c);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{c.title}</p>
                        <p className="text-xs text-slate-500">
                          {c.staff?.name}
                          {period ? ` · ${period}` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-700">
                          {c.client?.name ?? <span className="text-slate-400">—</span>}
                        </p>
                        {c.task && (
                          <p className="text-[11px] text-slate-500">{c.task.title}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {c.items.length} item{c.items.length === 1 ? "" : "s"}
                        <p className="max-w-52 truncate text-[11px] text-slate-400">
                          {c.items.map((i) => i.category).join(", ")}
                        </p>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {formatCurrency(c.totalAmount)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={EXPENSE_STATUS_TONE[c.status]}>{c.status}</Badge>
                        {c.decidedByName && (
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            by {c.decidedByName}
                            {c.decisionNote ? ` — ${c.decisionNote}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {c.invoice ? (
                          <span className="font-mono text-xs text-slate-600">
                            {c.invoice.invoiceNumber}
                          </span>
                        ) : c.status === "Approved" && canApprove ? (
                          c.clientId ? (
                            <button
                              onClick={() => setBilling(c)}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
                            >
                              <Receipt className="h-3.5 w-3.5" /> Bill client
                            </button>
                          ) : (
                            <span className="text-[11px] text-amber-600">
                              Link a client to bill
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canApprove && c.status === "Pending" && (
                            <button
                              onClick={() => setDeciding(c)}
                              className="inline-flex items-center gap-1 rounded-lg bg-fern-600 px-2 py-1 text-xs font-medium text-white hover:bg-fern-700"
                            >
                              <Check className="h-3.5 w-3.5" /> Decide
                            </button>
                          )}
                          {(canApprove || (own && c.status === "Pending")) && (
                            <button
                              onClick={() => {
                                setEditing(c);
                                setFormOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {(canApprove || (own && c.status === "Pending")) && (
                            <button
                              onClick={() => setToDelete(c)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Withdraw / delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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
        <ClaimForm
          initial={editing}
          clients={clients ?? []}
          tasks={tasks ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {deciding && (
        <DecisionModal
          claim={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!billing}
        onClose={() => setBilling(null)}
        title="Bill these expenses to the client?"
        message={`A draft invoice for ${formatCurrency(billing?.totalAmount ?? 0)} (no GST — pure reimbursement) will be raised on ${billing?.client?.name}. You can adjust it before sending.`}
        onConfirm={async () => {
          if (billing) await billClaim(billing);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Withdraw this claim?"
        message={`The ${formatCurrency(toDelete?.totalAmount ?? 0)} claim “${toDelete?.title}” will be removed.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/expenses/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

// Approve / reject with an optional note.
function DecisionModal({
  claim,
  onClose,
  onDone,
}: {
  claim: ExpenseClaim;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decide(action: "Approve" | "Reject") {
    setBusy(action);
    setErr(null);
    try {
      await apiMutate(`/api/expenses/${claim.id}`, "PATCH", { action, note: note || null });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save decision");
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Decide claim — ${claim.title}`}
      description={`${claim.staff?.name} claims ${formatCurrency(claim.totalAmount)}${periodLabel(claim) ? ` for ${periodLabel(claim)}` : ""}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={!!busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => decide("Reject")} disabled={!!busy}>
            <X className="h-4 w-4" /> {busy === "Reject" ? "Rejecting…" : "Reject"}
          </Button>
          <Button onClick={() => decide("Approve")} disabled={!!busy}>
            <Check className="h-4 w-4" /> {busy === "Approve" ? "Approving…" : "Approve"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {claim.items.map((i, idx) => (
          <li key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-slate-700">{i.category}</span>
              <span className="text-slate-500"> — {i.description}</span>
              {i.date && (
                <span className="text-[11px] text-slate-400"> · {formatDate(i.date)}</span>
              )}
            </span>
            <span className="shrink-0 font-medium text-slate-800">
              {formatCurrency(i.amount)}
            </span>
          </li>
        ))}
      </ul>
      <Field label="Note (optional)" hint="Shared with the requester">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Approved — attach the toll receipts to the file"
        />
      </Field>
    </Modal>
  );
}

type ItemDraft = { date: string; category: string; description: string; amount: string };

function ClaimForm({
  initial,
  clients,
  tasks,
  onClose,
  onSaved,
}: {
  initial: ExpenseClaim | null;
  clients: Client[];
  tasks: Task[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [taskId, setTaskId] = useState(initial?.taskId ?? "");
  const [periodFrom, setPeriodFrom] = useState(toDateInput(initial?.periodFrom));
  const [periodTo, setPeriodTo] = useState(toDateInput(initial?.periodTo));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((i) => ({
      date: toDateInput(i.date),
      category: i.category,
      description: i.description,
      amount: String(i.amount),
    })) ?? [{ date: "", category: "Conveyance", description: "", amount: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The engagement being claimed against — usually an audit task of the client.
  const clientTasks = clientId ? tasks.filter((t) => t.clientId === clientId) : [];
  const total = useMemo(
    () => items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
    [items],
  );

  const setItem = (idx: number, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((list) => list.filter((_, i) => i !== idx));
  const addItem = () =>
    setItems((list) => [...list, { date: "", category: "Conveyance", description: "", amount: "" }]);

  const valid =
    title.trim() &&
    items.length > 0 &&
    items.every((i) => i.description.trim() && parseFloat(i.amount) > 0);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        title,
        clientId: clientId || null,
        taskId: taskId || null,
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
        notes: notes || null,
        items: items.map((i) => ({
          date: i.date || null,
          category: i.category,
          description: i.description,
          amount: parseFloat(i.amount) || 0,
        })),
      };
      if (isEdit) await apiMutate(`/api/expenses/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/expenses", "POST", payload);
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
      title={isEdit ? "Edit Claim" : "New Reimbursement Claim"}
      description="Conveyance & other out-of-pocket expenses from an audit assignment, sent to a Partner/Admin for approval."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? "Saving…" : isEdit ? "Save changes" : `Submit claim · ${formatCurrency(total)}`}
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
        <Field label="Assignment / purpose" required className="sm:col-span-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Bank audit — PNB Fort branch"
          />
        </Field>
        <Field label="Client" hint="Needed later to bill the expenses onward">
          <Select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setTaskId("");
            }}
          >
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related task" hint={clientId ? undefined : "Select a client first"}>
          <Select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={!clientId}
          >
            <option value="">— None —</option>
            {clientTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {t.category}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignment period — from">
          <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        </Field>
        <Field label="Assignment period — to">
          <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">
              Expense details <span className="text-rose-500">*</span>
            </p>
            <p className="text-xs font-semibold text-slate-700">
              Total: {formatCurrency(total)}
            </p>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2 sm:grid-cols-[130px_150px_1fr_110px_32px]"
              >
                <Input
                  type="date"
                  value={it.date}
                  onChange={(e) => setItem(idx, { date: e.target.value })}
                  aria-label="Expense date"
                />
                <Select
                  value={it.category}
                  onChange={(e) => setItem(idx, { category: e.target.value })}
                  aria-label="Category"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Input
                  value={it.description}
                  onChange={(e) => setItem(idx, { description: e.target.value })}
                  placeholder="e.g. Auto fare office ↔ branch (4 days)"
                  aria-label="Description"
                />
                <Input
                  type="number"
                  min={0}
                  value={it.amount}
                  onChange={(e) => setItem(idx, { amount: e.target.value })}
                  placeholder="₹"
                  aria-label="Amount"
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  className="flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                  title="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add expense item
          </button>
        </div>

        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the approver should know (receipts attached to the file, etc.)"
          />
        </Field>
      </div>
    </Modal>
  );
}
