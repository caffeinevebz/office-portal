"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
  Archive,
  Package,
  Truck,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { DocPacket, Client } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { PACKET_MODES, PACKET_STATUSES } from "@/lib/constants";
import { formatDate, toDateInput, daysUntil, cn } from "@/lib/format";

type FormState = Partial<DocPacket>;

/** Days the packet has been with the firm (for holding-age warnings). */
function heldDays(p: DocPacket): number {
  return Math.abs(daysUntil(p.receivedAt) ?? 0);
}

export default function InwardPage() {
  const { can } = useAuth();
  const canManage = can("manageInward");
  const canDelete = can("deleteInward");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const url = `/api/inward?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`;
  const { data, loading, error, refresh } = useResource<DocPacket[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocPacket | null>(null);
  const [toDelete, setToDelete] = useState<DocPacket | null>(null);
  const [historyFor, setHistoryFor] = useState<DocPacket | null>(null);
  const [moveFor, setMoveFor] = useState<DocPacket | null>(null);

  const all = data ?? [];
  const inCustody = all.filter((p) => p.status === "In Custody");
  const longHeld = inCustody.filter((p) => heldDays(p) > 90);
  const returned = all.filter((p) => p.status === "Returned");

  return (
    <div>
      <PageHeader
        title="Inward / Outward Register"
        subtitle="Physical documents received from clients and returned to them"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Receive Documents
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Packets in custody" value={inCustody.length} icon={Archive} accent="indigo" />
        <StatCard
          label="Held over 90 days"
          value={longHeld.length}
          icon={Package}
          accent={longHeld.length > 0 ? "amber" : "emerald"}
          hint={longHeld.length > 0 ? "Consider returning originals" : "Nothing overdue"}
        />
        <StatCard label="Returned" value={returned.length} icon={ArrowUpFromLine} accent="emerald" />
        <StatCard label="Total entries" value={all.length} icon={ArrowDownToLine} accent="blue" />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by inward no., client, person or contents…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All statuses</option>
            {PACKET_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading register…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : all.length === 0 ? (
          <EmptyState
            icon={ArrowDownToLine}
            title="No entries in the register"
            message="Record documents received from a client to start the inward register."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Inward</th>
                  <th className="px-5 py-3">Client / from</th>
                  <th className="px-5 py-3">Contents</th>
                  <th className="px-5 py-3">Storage</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((p) => {
                  const held = heldDays(p);
                  const warn = p.status === "In Custody" && held > 90;
                  const lastOut = p.movements?.find((m) => m.direction === "Out");
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs font-medium text-slate-800">
                          {p.inwardNumber}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDate(p.receivedAt)} · by {p.receivedByName}
                        </p>
                        {p.mode !== "Hand Delivery" && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                            <Truck className="h-3 w-3" />
                            {p.mode}
                            {p.courierRef ? ` · ${p.courierRef}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">
                          {p.client?.name ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500">via {p.receivedFrom}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="max-w-xs truncate text-slate-700" title={p.contents}>
                          {p.contents}
                        </p>
                        {p.purpose && (
                          <p className="text-xs text-slate-400">{p.purpose}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {p.status === "In Custody" ? (p.location ?? "—") : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={p.status === "In Custody" ? "indigo" : "green"}>
                          {p.status}
                        </Badge>
                        {p.status === "In Custody" && (
                          <p className={cn("mt-0.5 text-xs", warn ? "font-medium text-amber-600" : "text-slate-400")}>
                            held {held}d
                          </p>
                        )}
                        {p.status === "Returned" && lastOut?.outwardNumber && (
                          <p className="mt-0.5 font-mono text-xs text-slate-400">
                            {lastOut.outwardNumber}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && (
                            <button
                              onClick={() => setMoveFor(p)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                              title={p.status === "In Custody" ? "Return / dispatch to client" : "Receive back"}
                            >
                              {p.status === "In Custody" ? (
                                <ArrowUpFromLine className="h-4 w-4" />
                              ) : (
                                <ArrowDownToLine className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => setHistoryFor(p)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Movement history"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => {
                                setEditing(p);
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
                              onClick={() => setToDelete(p)}
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
        <PacketForm
          initial={editing}
          clients={clients ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {moveFor && (
        <MovementModal
          packet={moveFor}
          onClose={() => setMoveFor(null)}
          onSaved={() => {
            setMoveFor(null);
            refresh();
          }}
        />
      )}

      {historyFor && (
        <Modal
          open
          onClose={() => setHistoryFor(null)}
          title={`Movements — ${historyFor.inwardNumber}`}
          description={historyFor.contents}
        >
          <ul className="divide-y divide-slate-100">
            <li className="flex items-start gap-3 py-3">
              <Badge tone="indigo">Received</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700">
                  From {historyFor.receivedFrom} · {historyFor.mode}
                  {historyFor.courierRef ? ` (${historyFor.courierRef})` : ""}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDate(historyFor.receivedAt)} · by {historyFor.receivedByName} ·{" "}
                  <span className="font-mono">{historyFor.inwardNumber}</span>
                </p>
              </div>
            </li>
            {(historyFor.movements ?? []).map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-3">
                <Badge tone={m.direction === "Out" ? "amber" : "indigo"}>
                  {m.direction === "Out" ? "Dispatched" : "Received back"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">
                    {m.direction === "Out" ? "To" : "From"} {m.person} · {m.mode}
                    {m.courierRef ? ` (${m.courierRef})` : ""}
                  </p>
                  {m.note && <p className="text-xs text-slate-500">{m.note}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDate(m.createdAt)} · by {m.byName}
                    {m.outwardNumber && (
                      <>
                        {" · "}
                        <span className="font-mono">{m.outwardNumber}</span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete entry ${toDelete?.inwardNumber}?`}
        message="The register entry and its movement history will be removed."
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/inward/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function MovementModal({
  packet,
  onClose,
  onSaved,
}: {
  packet: DocPacket;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dispatching = packet.status === "In Custody";
  const [person, setPerson] = useState(dispatching ? (packet.client?.contactPerson ?? "") : packet.receivedFrom);
  const [mode, setMode] = useState("Hand Delivery");
  const [courierRef, setCourierRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await apiMutate(`/api/inward/${packet.id}/movement`, "POST", {
        direction: dispatching ? "Out" : "In",
        person,
        mode,
        courierRef,
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
      title={dispatching ? "Return / dispatch documents" : "Receive documents back"}
      description={`${packet.inwardNumber} · ${packet.contents}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !person.trim()}>
            {busy ? "Recording…" : dispatching ? "Record dispatch" : "Record receipt"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      {dispatching && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          An outward number will be issued automatically and the entry marked{" "}
          <strong>Returned</strong>.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={dispatching ? "Handed over / dispatched to" : "Received from"} required className="sm:col-span-2">
          <Input value={person} onChange={(e) => setPerson(e.target.value)} />
        </Field>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {PACKET_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Courier / docket no." hint="If sent by courier or post">
          <Input value={courierRef} onChange={(e) => setCourierRef(e.target.value)} />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. acknowledgement taken on delivery challan"
          />
        </Field>
      </div>
    </Modal>
  );
}

function PacketForm({
  initial,
  clients,
  onClose,
  onSaved,
}: {
  initial: DocPacket | null;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ?? { mode: "Hand Delivery" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        receivedFrom: form.receivedFrom,
        contents: form.contents,
        purpose: form.purpose,
        mode: form.mode,
        courierRef: form.courierRef,
        location: form.location,
        notes: form.notes,
        receivedAt: form.receivedAt || null,
        clientId: form.clientId || null,
      };
      if (isEdit) await apiMutate(`/api/inward/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/inward", "POST", payload);
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
      title={isEdit ? `Edit ${initial!.inwardNumber}` : "Receive Documents (Inward)"}
      description={
        isEdit
          ? "Update the register entry details."
          : "An inward number is assigned automatically and the receipt is recorded under your name."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.receivedFrom || !form.contents}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Record receipt"}
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
        <Field label="Delivered by (person)" required>
          <Input
            value={form.receivedFrom ?? ""}
            onChange={(e) => set("receivedFrom", e.target.value)}
            placeholder="e.g. Rohan Mehta"
          />
        </Field>
        <Field label="Contents" required className="sm:col-span-2">
          <Textarea
            value={form.contents ?? ""}
            onChange={(e) => set("contents", e.target.value)}
            placeholder="e.g. Original sale deed, 3 bank statements FY25-26, signed 3CD"
          />
        </Field>
        <Field label="Purpose / engagement">
          <Input
            value={form.purpose ?? ""}
            onChange={(e) => set("purpose", e.target.value)}
            placeholder="e.g. Statutory audit"
          />
        </Field>
        <Field label="Received on">
          <Input
            type="date"
            value={toDateInput(form.receivedAt)}
            onChange={(e) => set("receivedAt", e.target.value)}
          />
        </Field>
        <Field label="Mode">
          <Select value={form.mode ?? ""} onChange={(e) => set("mode", e.target.value)}>
            {PACKET_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Courier / docket no.">
          <Input
            value={form.courierRef ?? ""}
            onChange={(e) => set("courierRef", e.target.value)}
          />
        </Field>
        <Field label="Storage location" hint="Where the packet is kept in the office">
          <Input
            value={form.location ?? ""}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Almirah 1, Shelf B"
          />
        </Field>
        <Field label="Notes">
          <Input value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
