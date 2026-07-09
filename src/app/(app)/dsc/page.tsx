"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  History,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ArrowLeftRight,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Dsc, Client } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { DSC_CLASSES, DSC_AUTHORITIES, DSC_STATUSES } from "@/lib/constants";
import { formatDate, toDateInput, daysUntil, initials, cn } from "@/lib/format";

type FormState = Partial<Dsc>;

/** Effective status, deriving "Expired" from the expiry date. */
function effectiveStatus(d: Dsc): string {
  if (d.status !== "Active") return d.status;
  return (daysUntil(d.expiryDate) ?? 0) < 0 ? "Expired" : "Active";
}

function expiryBadge(d: Dsc) {
  const days = daysUntil(d.expiryDate) ?? 0;
  if (d.status !== "Active")
    return <span className="text-xs text-slate-400">—</span>;
  if (days < 0)
    return <Badge tone="red">Expired {Math.abs(days)}d ago</Badge>;
  if (days <= 30) return <Badge tone="amber">{days}d left</Badge>;
  return <span className="text-xs text-slate-500">{days}d left</span>;
}

const statusTone = (s: string) =>
  s === "Active" ? "green" : s === "Expired" ? "red" : "slate";

export default function DscPage() {
  const { can } = useAuth();
  const canManage = can("manageDsc");
  const canDelete = can("deleteDsc");

  const [q, setQ] = useState("");
  const [custody, setCustody] = useState("All");
  const url = `/api/dsc?q=${encodeURIComponent(q)}&custody=${encodeURIComponent(custody)}`;
  const { data, loading, error, refresh } = useResource<Dsc[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Dsc | null>(null);
  const [toDelete, setToDelete] = useState<Dsc | null>(null);
  const [historyFor, setHistoryFor] = useState<Dsc | null>(null);
  const [custodyFor, setCustodyFor] = useState<Dsc | null>(null);

  const all = data ?? [];
  const active = all.filter((d) => effectiveStatus(d) === "Active");
  const expiring = active.filter((d) => (daysUntil(d.expiryDate) ?? 99) <= 30);
  const expired = all.filter((d) => effectiveStatus(d) === "Expired");
  const withFirm = all.filter(
    (d) => d.custody === "With Firm" && d.status === "Active",
  );

  return (
    <div>
      <PageHeader
        title="DSC Register"
        subtitle="Digital Signature Certificates: validity and token custody"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add DSC
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active DSCs" value={active.length} icon={ShieldCheck} accent="emerald" />
        <StatCard
          label="Expiring in 30 days"
          value={expiring.length}
          icon={ShieldAlert}
          accent={expiring.length > 0 ? "amber" : "emerald"}
          hint={expiring.length > 0 ? "Start renewals now" : "None at risk"}
        />
        <StatCard
          label="Expired"
          value={expired.length}
          icon={ShieldX}
          accent={expired.length > 0 ? "rose" : "emerald"}
          hint={expired.length > 0 ? "Cannot sign filings" : "All valid"}
        />
        <StatCard label="Tokens with the firm" value={withFirm.length} icon={KeyRound} accent="indigo" />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by holder, client or serial number…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
          </div>
          <select
            value={custody}
            onChange={(e) => setCustody(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
          >
            <option value="All">All custody</option>
            <option>With Firm</option>
            <option>With Client</option>
          </select>
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading DSC register…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : all.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No DSCs on record"
            message="Add the digital signature certificates the firm tracks or holds."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Holder</th>
                  <th className="px-5 py-3">Certificate</th>
                  <th className="px-5 py-3">Expiry</th>
                  <th className="px-5 py-3">Custody</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((d) => {
                  const st = effectiveStatus(d);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                            {initials(d.holderName)}
                          </span>
                          <div>
                            <p className="font-medium text-slate-800">{d.holderName}</p>
                            <p className="text-xs text-slate-500">
                              {d.client?.name ?? "No client linked"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-700">
                          {d.class} · {d.authority}
                        </p>
                        <p className="font-mono text-xs text-slate-400">
                          {d.serialNumber ?? "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-700">{formatDate(d.expiryDate)}</p>
                        <div className="mt-0.5">{expiryBadge(d)}</div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={d.custody === "With Firm" ? "indigo" : "slate"}>
                          {d.custody}
                        </Badge>
                        {d.custody === "With Firm" && d.location && (
                          <p className="mt-0.5 text-xs text-slate-400">{d.location}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(st)}>{st}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && (
                            <button
                              onClick={() => setCustodyFor(d)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                              title={d.custody === "With Firm" ? "Hand over to client" : "Receive from client"}
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setHistoryFor(d)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Movement history"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => {
                                setEditing(d);
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
                              onClick={() => setToDelete(d)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Delete"
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
        <DscForm
          initial={editing}
          clients={clients ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {custodyFor && (
        <CustodyModal
          dsc={custodyFor}
          onClose={() => setCustodyFor(null)}
          onSaved={() => {
            setCustodyFor(null);
            refresh();
          }}
        />
      )}

      {historyFor && (
        <Modal
          open
          onClose={() => setHistoryFor(null)}
          title={`Movement history — ${historyFor.holderName}`}
          description="In/out register for this DSC token."
        >
          {!historyFor.movements || historyFor.movements.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">No movements recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {historyFor.movements.map((m) => (
                <li key={m.id} className="flex items-start gap-3 py-3">
                  <Badge tone={m.direction === "In" ? "green" : "amber"}>
                    {m.direction === "In" ? "Received" : "Handed out"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">{m.note ?? "—"}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDate(m.createdAt)} · by {m.byName}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete DSC of ${toDelete?.holderName}?`}
        message="The certificate record and its movement history will be removed."
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/dsc/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function CustodyModal({
  dsc,
  onClose,
  onSaved,
}: {
  dsc: Dsc;
  onClose: () => void;
  onSaved: () => void;
}) {
  const receiving = dsc.custody === "With Client"; // firm takes the token in
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await apiMutate(`/api/dsc/${dsc.id}/custody`, "POST", {
        direction: receiving ? "In" : "Out",
        note,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record movement");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={receiving ? "Receive token from client" : "Hand token to client"}
      description={`${dsc.holderName} · ${dsc.class} · ${dsc.serialNumber ?? "no serial"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Recording…" : receiving ? "Record receipt" : "Record hand-over"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      <p className="mb-3 text-sm text-slate-600">
        This will mark the token as{" "}
        <strong>{receiving ? "With Firm" : "With Client"}</strong> and add an entry
        to the in/out register under your name.
      </p>
      <Field label="Note" hint="e.g. purpose of the hand-over, who collected it">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

function DscForm({
  initial,
  clients,
  onClose,
  onSaved,
}: {
  initial: Dsc | null;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? { class: "Class 3", authority: "eMudhra", status: "Active" },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        holderName: form.holderName,
        class: form.class,
        authority: form.authority,
        serialNumber: form.serialNumber,
        email: form.email,
        phone: form.phone,
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate,
        status: form.status,
        location: form.location,
        notes: form.notes,
        clientId: form.clientId || null,
      };
      if (isEdit) await apiMutate(`/api/dsc/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/dsc", "POST", payload);
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
      title={isEdit ? "Edit DSC" : "Add DSC"}
      description="Certificate details and holder contact for expiry reminders."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.holderName || !form.expiryDate}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add DSC"}
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
        <Field label="Holder name" required>
          <Input
            value={form.holderName ?? ""}
            onChange={(e) => set("holderName", e.target.value)}
            placeholder="e.g. Rohan Mehta"
          />
        </Field>
        <Field label="Client">
          <Select value={form.clientId ?? ""} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class">
          <Select value={form.class ?? ""} onChange={(e) => set("class", e.target.value)}>
            {DSC_CLASSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Certifying authority">
          <Select value={form.authority ?? ""} onChange={(e) => set("authority", e.target.value)}>
            {DSC_AUTHORITIES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </Field>
        <Field label="Serial / token number">
          <Input
            value={form.serialNumber ?? ""}
            onChange={(e) => set("serialNumber", e.target.value)}
            placeholder="EM-4471-8823"
          />
        </Field>
        <Field label="Status">
          <Select value={form.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            {DSC_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Issue date">
          <Input
            type="date"
            value={toDateInput(form.issueDate)}
            onChange={(e) => set("issueDate", e.target.value)}
          />
        </Field>
        <Field label="Expiry date" required>
          <Input
            type="date"
            value={toDateInput(form.expiryDate)}
            onChange={(e) => set("expiryDate", e.target.value)}
          />
        </Field>
        <Field label="Holder email" hint="Used for expiry reminders (falls back to the client's)">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Holder phone">
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Storage location" hint="Where the token is kept when with the firm">
          <Input
            value={form.location ?? ""}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Locker A, Tray 2"
          />
        </Field>
        <Field label="Notes">
          <Input value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
