"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Plus, Pencil, Trash2, Eye, Users } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Client } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { CLIENT_TYPES, CLIENT_STATUSES, CLIENT_STATUS_TONE } from "@/lib/constants";
import { initials } from "@/lib/format";

type FormState = Partial<Client>;
const EMPTY: FormState = { type: "Private Limited", status: "Active" };

export default function ClientsPage() {
  const { can } = useAuth();
  const canManage = can("manageClients");
  const canDelete = can("deleteClients");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const url = `/api/clients?q=${encodeURIComponent(q)}&status=${status}`;
  const { data, loading, error, refresh } = useResource<Client[]>(url);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: Client) {
    setEditing(c);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Individuals and businesses managed by the firm"
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Client
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, PAN, GSTIN or contact…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
          >
            <option value="All">All statuses</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading clients…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients found"
            message="Try adjusting your search, or add your first client."
            action={
              canManage ? (
                <Button onClick={openCreate} size="sm">
                  <Plus className="h-4 w-4" /> Add Client
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">PAN</th>
                  <th className="px-5 py-3">GSTIN</th>
                  <th className="px-5 py-3">Open Tasks</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/clients/${c.id}`} className="flex items-center gap-3 group">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                          {initials(c.name)}
                        </span>
                        <span>
                          <span className="block font-medium text-slate-800 group-hover:text-indigo-600">
                            {c.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {c.type}
                            {c.contactPerson ? ` · ${c.contactPerson}` : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">
                      {c.pan ?? "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">
                      {c.gstin ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {c._count?.tasks ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={CLIENT_STATUS_TONE[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/clients/${c.id}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {canManage && (
                          <button
                            onClick={() => openEdit(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setToDelete(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
        <ClientForm
          initial={editing}
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
        title={`Delete ${toDelete?.name}?`}
        message="This removes the client and all their invoices and documents. Tasks will be unlinked."
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/clients/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function ClientForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;

  const set = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        status: form.status ?? "Active",
        pan: form.pan,
        gstin: form.gstin,
        email: form.email,
        phone: form.phone,
        contactPerson: form.contactPerson,
        address: form.address,
        notes: form.notes,
      };
      if (isEdit) await apiMutate(`/api/clients/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/clients", "POST", payload);
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
      title={isEdit ? "Edit Client" : "New Client"}
      description="Client and statutory registration details."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.name}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create client"}
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
        <Field label="Client name" required className="sm:col-span-2">
          <Input
            value={form.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Nimbus Technologies Pvt Ltd"
          />
        </Field>
        <Field label="Entity type" required>
          <Select value={form.type ?? ""} onChange={(e) => set("type", e.target.value)}>
            {CLIENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={form.status ?? "Active"}
            onChange={(e) => set("status", e.target.value)}
          >
            {CLIENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="PAN">
          <Input
            value={form.pan ?? ""}
            onChange={(e) => set("pan", e.target.value.toUpperCase())}
            placeholder="AABCN1234E"
            maxLength={10}
          />
        </Field>
        <Field label="GSTIN">
          <Input
            value={form.gstin ?? ""}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="27AABCN1234E1Z5"
            maxLength={15}
          />
        </Field>
        <Field label="Contact person">
          <Input
            value={form.contactPerson ?? ""}
            onChange={(e) => set("contactPerson", e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Engagement scope, retainer terms, etc."
          />
        </Field>
      </div>
    </Modal>
  );
}
