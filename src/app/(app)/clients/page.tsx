"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Plus, Pencil, Trash2, Eye, Users, FileUp, Download, FolderTree, Building2, X } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Client, ClientGroup } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { CLIENT_TYPES, CLIENT_STATUSES, CLIENT_STATUS_TONE, entityRegField } from "@/lib/constants";
import { initials } from "@/lib/format";

type FormState = Partial<Client>;
type TradeNameDraft = { id?: string; name: string; gstin: string; pan: string; address: string };
const EMPTY: FormState = { type: "Private Limited", status: "Active" };

export default function ClientsPage() {
  const { can } = useAuth();
  const canManage = can("manageClients");
  const canDelete = can("deleteClients");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [group, setGroup] = useState("All");
  const url = `/api/clients?q=${encodeURIComponent(q)}&status=${status}&groupId=${group}`;
  const { data, loading, error, refresh } = useResource<Client[]>(url);
  const groups = useResource<ClientGroup[]>("/api/client-groups");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);

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
            <>
              <Button variant="secondary" onClick={() => setGroupsOpen(true)}>
                <FolderTree className="h-4 w-4" /> Groups
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <FileUp className="h-4 w-4" /> Import Excel
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add Client
              </Button>
            </>
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
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All groups</option>
            <option value="None">Ungrouped</option>
            {(groups.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
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
                  <th className="px-5 py-3">Group</th>
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
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {initials(c.name)}
                        </span>
                        <span>
                          <span className="block font-medium text-slate-800 group-hover:text-brand-600">
                            {c.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {c.type}
                            {c.contactPerson ? ` · ${c.contactPerson}` : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {c.group ? (
                        <Badge tone="indigo">{c.group.code}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
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
          groups={groups.data ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {groupsOpen && (
        <GroupsModal
          groups={groups.data ?? []}
          onClose={() => setGroupsOpen(false)}
          onChanged={() => {
            groups.refresh();
            refresh();
          }}
        />
      )}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={refresh}
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
  groups,
  onClose,
  onSaved,
}: {
  initial: Client | null;
  groups: ClientGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  // The entity-specific registration field (Aadhaar / CIN / LLPIN / Firm Reg.)
  // shown for the currently selected entity type.
  const reg = entityRegField(form.type);

  // Firm / trade names the client operates under (add as many as needed).
  const [tradeNames, setTradeNames] = useState<TradeNameDraft[]>(
    (initial?.tradeNames ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      gstin: t.gstin ?? "",
      pan: t.pan ?? "",
      address: t.address ?? "",
    })),
  );
  const addTradeName = () =>
    setTradeNames((ts) => [...ts, { name: "", gstin: "", pan: "", address: "" }]);
  const updateTradeName = (i: number, key: keyof TradeNameDraft, v: string) =>
    setTradeNames((ts) => ts.map((t, idx) => (idx === i ? { ...t, [key]: v } : t)));
  const removeTradeName = (i: number) => setTradeNames((ts) => ts.filter((_, idx) => idx !== i));

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
        tan: form.tan,
        aadhaar: form.aadhaar,
        cin: form.cin,
        llpin: form.llpin,
        firmRegNo: form.firmRegNo,
        email: form.email,
        phone: form.phone,
        contactPerson: form.contactPerson,
        address: form.address,
        groupId: form.groupId || null,
        notes: form.notes,
        tradeNames: tradeNames
          .filter((t) => t.name.trim())
          .map((t) => ({
            id: t.id,
            name: t.name.trim(),
            gstin: t.gstin.trim() || null,
            pan: t.pan.trim() || null,
            address: t.address.trim() || null,
          })),
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
        <Field label="Client group" hint="Manage groups from the Groups button" className="sm:col-span-2">
          <Select value={form.groupId ?? ""} onChange={(e) => set("groupId", e.target.value)}>
            <option value="">— No group —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
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
        <Field label="TAN" hint="Tax deduction account no.">
          <Input
            value={form.tan ?? ""}
            onChange={(e) => set("tan", e.target.value.toUpperCase())}
            placeholder="MUMA12345B"
            maxLength={10}
          />
        </Field>
        {reg && (
          <Field label={reg.label}>
            <Input
              value={(form[reg.key] as string | null | undefined) ?? ""}
              onChange={(e) =>
                set(reg.key, reg.key === "aadhaar" ? e.target.value : e.target.value.toUpperCase())
              }
              placeholder={reg.placeholder}
              maxLength={reg.maxLength}
            />
          </Field>
        )}
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
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Building2 className="h-4 w-4 text-brand-600" />
              Firm / trade names
              {tradeNames.length > 0 && (
                <span className="text-xs font-normal text-slate-400">{tradeNames.length} added</span>
              )}
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addTradeName}>
              <Plus className="h-4 w-4" /> Add trade name
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            A proprietorship concern or brand name the client operates under. Add as many as needed — each can carry
            its own GSTIN/PAN/address for invoicing.
          </p>
          {tradeNames.length > 0 && (
            <div className="mt-3 space-y-3">
              {tradeNames.map((t, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Trade name {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeTradeName(i)}
                      className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Name" required className="sm:col-span-2">
                      <Input
                        value={t.name}
                        onChange={(e) => updateTradeName(i, "name", e.target.value)}
                        placeholder="e.g. Sunrise Traders"
                      />
                    </Field>
                    <Field label="GSTIN">
                      <Input
                        value={t.gstin}
                        onChange={(e) => updateTradeName(i, "gstin", e.target.value.toUpperCase())}
                        maxLength={15}
                      />
                    </Field>
                    <Field label="PAN">
                      <Input
                        value={t.pan}
                        onChange={(e) => updateTradeName(i, "pan", e.target.value.toUpperCase())}
                        maxLength={10}
                      />
                    </Field>
                    <Field label="Address" className="sm:col-span-2">
                      <Input value={t.address} onChange={(e) => updateTradeName(i, "address", e.target.value)} />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<{
    created: number;
    skipped: { row: number; name: string; reason: string }[];
    skippedTotal: number;
  } | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/clients/import", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Import failed (${res.status})`);
      setReport(json);
      onImported();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Import clients from Excel"
      description="Upload an .xlsx file based on the template. Duplicates (same PAN or name) are skipped."
      footer={
        report ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={busy || !file}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </>
        )
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}

      {report ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
            Imported <strong>{report.created}</strong> client
            {report.created === 1 ? "" : "s"}
            {report.skippedTotal > 0 && (
              <> · skipped {report.skippedTotal} row{report.skippedTotal === 1 ? "" : "s"}</>
            )}
            .
          </div>
          {report.skipped.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Skipped because</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.skipped.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-slate-400">{s.row}</td>
                      <td className="px-3 py-1.5 text-slate-700">{s.name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <a
            href="/api/clients/import/template"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-brand-600 hover:bg-brand-50"
          >
            <Download className="h-4 w-4" />
            Download the import template (.xlsx)
          </a>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Filled-in template
            </label>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
            />
          </div>
          <p className="text-xs text-slate-400">
            Columns: Name (required), Type, PAN, GSTIN, Email, Phone, Contact
            Person, Address, Status, Notes. Up to 1,000 rows per file.
          </p>
        </div>
      )}
    </Modal>
  );
}

function GroupsModal({
  groups,
  onClose,
  onChanged,
}: {
  groups: ClientGroup[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<{ id?: string; code: string; name: string; notes: string }>({
    code: "",
    name: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editing = !!form.id;

  function reset() {
    setForm({ code: "", name: "", notes: "" });
    setErr(null);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = { code: form.code, name: form.name, notes: form.notes };
      if (editing) await apiMutate(`/api/client-groups/${form.id}`, "PUT", body);
      else await apiMutate("/api/client-groups", "POST", body);
      reset();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save the group");
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: ClientGroup) {
    setBusy(true);
    try {
      await apiMutate(`/api/client-groups/${g.id}`, "DELETE");
      if (form.id === g.id) reset();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Client groups"
      description="Physically segregate clients into groups, each with a short unique code you assign."
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
        <Field label="Code" required>
          <Input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="BHNS"
            maxLength={16}
          />
        </Field>
        <Field label="Group name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Bhansali Family Group"
          />
        </Field>
        <div className="flex gap-2">
          {editing && (
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button onClick={save} disabled={busy || !form.code.trim() || !form.name.trim()}>
            {editing ? "Save" : "Add group"}
          </Button>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
        {groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No groups yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Clients</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Badge tone="indigo">{g.code}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{g.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{g._count?.clients ?? 0}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setForm({ id: g.id, code: g.code, name: g.name, notes: g.notes ?? "" })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(g)}
                        disabled={busy}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
