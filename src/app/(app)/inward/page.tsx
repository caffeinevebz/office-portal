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
  X,
  ListChecks,
} from "lucide-react";
import { useResource, useDebounced, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { DocPacket, PacketItem, Client } from "@/lib/types";
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

/** The packet's entered document list, or null for legacy free-text entries. */
function packetItems(p: DocPacket): PacketItem[] | null {
  return p.items && p.items.length > 0 ? p.items : null;
}

export default function InwardPage() {
  const { can } = useAuth();
  const canManage = can("manageInward");
  const canDelete = can("deleteInward");

  const [q, setQ] = useState("");
  const qd = useDebounced(q);
  const [status, setStatus] = useState("All");
  const url = `/api/inward?q=${encodeURIComponent(qd)}&status=${encodeURIComponent(status)}`;
  const { data, loading, error, refresh } = useResource<DocPacket[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocPacket | null>(null);
  const [toDelete, setToDelete] = useState<DocPacket | null>(null);
  const [historyFor, setHistoryFor] = useState<DocPacket | null>(null);
  const [moveFor, setMoveFor] = useState<{ packet: DocPacket; direction: "Out" | "In" } | null>(
    null,
  );

  const all = data ?? [];
  const inCustody = all.filter((p) => p.status === "In Custody");
  const longHeld = inCustody.filter((p) => heldDays(p) > 90);
  const returned = all.filter((p) => p.status === "Returned");

  return (
    <div>
      <PageHeader
        title="Inward / Outward Register"
        subtitle="Physical documents received from clients — listed one by one, ticked off as they are returned"
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
                  <th className="px-5 py-3">Documents</th>
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
                  const items = packetItems(p);
                  const returnedCount = items?.filter((i) => i.returned).length ?? 0;
                  const partial = !!items && returnedCount > 0 && returnedCount < items.length;
                  // Selective returns: dispatch while anything is still held;
                  // receive back while anything is out with the client.
                  const canOut = items ? returnedCount < items.length : p.status === "In Custody";
                  const canIn = items ? returnedCount > 0 : p.status === "Returned";
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
                        {items ? (
                          <ul className="max-w-xs space-y-0.5">
                            {items.slice(0, 3).map((it, i) => (
                              <li
                                key={i}
                                className={cn(
                                  "truncate text-xs",
                                  it.returned ? "text-slate-400 line-through" : "text-slate-700",
                                )}
                                title={
                                  it.returned
                                    ? `Returned${it.returnedOn ? ` ${formatDate(it.returnedOn)}` : ""}${it.outwardNumber ? ` · ${it.outwardNumber}` : ""}`
                                    : "In custody"
                                }
                              >
                                {it.name}
                              </li>
                            ))}
                            {items.length > 3 && (
                              <li className="text-[11px] text-slate-400">
                                +{items.length - 3} more
                              </li>
                            )}
                          </ul>
                        ) : (
                          <p className="max-w-xs truncate text-slate-700" title={p.contents}>
                            {p.contents}
                          </p>
                        )}
                        {p.purpose && (
                          <p className="text-xs text-slate-400">{p.purpose}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {p.status === "In Custody" ? (p.location ?? "—") : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          tone={partial ? "amber" : p.status === "In Custody" ? "indigo" : "green"}
                        >
                          {partial ? "Partly returned" : p.status}
                        </Badge>
                        {items && (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {returnedCount}/{items.length} returned
                          </p>
                        )}
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
                          {canManage && canOut && (
                            <button
                              onClick={() => setMoveFor({ packet: p, direction: "Out" })}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                              title="Return / dispatch documents to the client"
                            >
                              <ArrowUpFromLine className="h-4 w-4" />
                            </button>
                          )}
                          {canManage && canIn && (
                            <button
                              onClick={() => setMoveFor({ packet: p, direction: "In" })}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                              title="Receive documents back"
                            >
                              <ArrowDownToLine className="h-4 w-4" />
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
          packet={moveFor.packet}
          direction={moveFor.direction}
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
                  {m.items && m.items.length > 0 && (
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                      <ListChecks className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{m.items.join(" · ")}</span>
                    </p>
                  )}
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
  direction,
  onClose,
  onSaved,
}: {
  packet: DocPacket;
  direction: "Out" | "In";
  onClose: () => void;
  onSaved: () => void;
}) {
  const dispatching = direction === "Out";
  const items = packetItems(packet);
  // The documents this movement can cover: unreturned ones going out,
  // returned ones coming back — selected straight from the entered list.
  const eligible = (items ?? [])
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => (dispatching ? !it.returned : it.returned));
  const [sel, setSel] = useState<number[]>(eligible.map(({ idx }) => idx));
  const toggleSel = (idx: number) =>
    setSel((s) => (s.includes(idx) ? s.filter((i) => i !== idx) : [...s, idx]));

  const [person, setPerson] = useState(
    dispatching ? (packet.client?.contactPerson ?? "") : packet.receivedFrom,
  );
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
        direction,
        person,
        mode,
        courierRef,
        note,
        itemIndexes: items ? sel : undefined,
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
      description={`${packet.inwardNumber}${packet.client?.name ? ` · ${packet.client.name}` : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !person.trim() || (!!items && sel.length === 0)}
          >
            {busy
              ? "Recording…"
              : items
                ? dispatching
                  ? `Return ${sel.length} document${sel.length === 1 ? "" : "s"}`
                  : `Receive ${sel.length} back`
                : dispatching
                  ? "Record dispatch"
                  : "Record receipt"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}

      {items && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-2">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="text-xs font-medium text-brand-700">
              {dispatching
                ? "Select the documents being returned to the client"
                : "Select the documents received back"}
            </span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSel(eligible.map(({ idx }) => idx))}
                className="text-brand-600 hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSel([])}
                className="text-slate-500 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
            {eligible.map(({ it, idx }) => (
              <label
                key={idx}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={sel.includes(idx)}
                  onChange={() => toggleSel(idx)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="flex-1 truncate">{it.name}</span>
                {!dispatching && it.outwardNumber && (
                  <span className="font-mono text-[11px] text-slate-400">{it.outwardNumber}</span>
                )}
              </label>
            ))}
          </div>
          {dispatching && (
            <p className="mt-1.5 px-0.5 text-[11px] text-slate-500">
              An outward number is issued for this dispatch; the entry is marked{" "}
              <strong>Returned</strong> once every document has gone back.
            </p>
          )}
        </div>
      )}
      {!items && dispatching && (
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

type ItemDraft = { name: string; returned: boolean; returnedOn?: string | null; outwardNumber?: string | null };

// Legacy entries carry a free-text contents line; editing one seeds the item
// list by splitting it, so old packets pick up the tick-off flow too.
function draftsFrom(initial: DocPacket | null): ItemDraft[] {
  if (!initial) return [{ name: "", returned: false }];
  if (initial.items && initial.items.length > 0) return initial.items.map((i) => ({ ...i }));
  const wholeReturned = initial.status === "Returned";
  const parts = initial.contents
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length
    ? parts.map((name) => ({ name, returned: wholeReturned }))
    : [{ name: "", returned: false }];
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
  // Documents received, entered one per row — returns tick items off this list.
  const [items, setItems] = useState<ItemDraft[]>(draftsFrom(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const setItemName = (i: number, name: string) =>
    setItems((list) => list.map((it, idx) => (idx === i ? { ...it, name } : it)));
  const addItem = () => setItems((list) => [...list, { name: "", returned: false }]);
  const removeItem = (i: number) => setItems((list) => list.filter((_, idx) => idx !== i));

  const namedItems = items.filter((i) => i.name.trim());

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        receivedFrom: form.receivedFrom,
        // The contents summary derives from the list server-side.
        items: namedItems.map((i) => ({
          name: i.name.trim(),
          returned: i.returned,
          returnedOn: i.returnedOn ?? null,
          outwardNumber: i.outwardNumber ?? null,
        })),
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
          : "List each document received — an inward number is assigned automatically, and returns simply tick documents off this list."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.receivedFrom || namedItems.length === 0}>
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

        {/* Documents received, one per row */}
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">
              Documents / files received <span className="text-rose-500">*</span>
            </p>
            <p className="text-xs text-slate-400">
              {namedItems.length} document{namedItems.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs text-slate-400">{i + 1}.</span>
                <Input
                  value={it.name}
                  onChange={(e) => setItemName(i, e.target.value)}
                  placeholder="e.g. Original sale deed"
                  disabled={it.returned}
                />
                {it.returned ? (
                  <span
                    className="shrink-0 text-[11px] text-slate-400"
                    title={it.outwardNumber ?? undefined}
                  >
                    returned{it.returnedOn ? ` ${formatDate(it.returnedOn)}` : ""}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add document
          </button>
        </div>

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
