"use client";

import { useState } from "react";
import { Search, Plus, Pencil, Trash2, FileText, FolderClosed } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { DocumentRecord, Client } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { DOC_CATEGORIES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type FormState = Partial<DocumentRecord>;

export default function DocumentsPage() {
  const { can } = useAuth();
  const canManage = can("manageDocuments");
  const canDelete = can("deleteDocuments");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const url = `/api/documents?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`;
  const { data, loading, error, refresh } = useResource<DocumentRecord[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients?slim=1");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [toDelete, setToDelete] = useState<DocumentRecord | null>(null);

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Statutory records and client paperwork tracked by the firm"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Document
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
              placeholder="Search documents…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All categories</option>
            {DOC_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading documents…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : !data || data.length === 0 ? (
          <EmptyState icon={FolderClosed} title="No documents found" message="Record a document to keep client paperwork organised." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Document</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">FY</th>
                  <th className="px-5 py-3">Added</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-medium text-slate-800">{d.name}</p>
                          {d.note && (
                            <p className="max-w-xs truncate text-xs text-slate-500">{d.note}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone="slate">{d.category}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.client?.name ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.financialYear && d.financialYear !== "-" ? d.financialYear : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(d.uploadedAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
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
                        {!canManage && !canDelete && (
                          <span className="text-xs text-slate-300">—</span>
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
        <DocumentForm
          initial={editing}
          clients={clients ?? []}
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
        title="Delete document?"
        message={`"${toDelete?.name}" will be removed from records.`}
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/documents/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function DocumentForm({
  initial,
  clients,
  onClose,
  onSaved,
}: {
  initial: DocumentRecord | null;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ?? { category: "PAN" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        clientId: form.clientId || null,
        financialYear: form.financialYear,
        note: form.note,
      };
      if (isEdit) await apiMutate(`/api/documents/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/documents", "POST", payload);
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
      title={isEdit ? "Edit Document" : "Add Document"}
      description="Track a document record. (File storage is out of scope for this demo.)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.name}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add document"}
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
        <Field label="Document name" required className="sm:col-span-2">
          <Input
            value={form.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Audited Financials FY24-25"
          />
        </Field>
        <Field label="Category">
          <Select value={form.category ?? ""} onChange={(e) => set("category", e.target.value)}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Financial year">
          <Input
            value={form.financialYear ?? ""}
            onChange={(e) => set("financialYear", e.target.value)}
            placeholder="2025-26"
          />
        </Field>
        <Field label="Client" className="sm:col-span-2">
          <Select value={form.clientId ?? ""} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
