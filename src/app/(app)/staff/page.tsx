"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Mail, Phone, UsersRound } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Staff } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { STAFF_ROLES } from "@/lib/constants";
import { initials } from "@/lib/format";

const ROLE_TONE: Record<string, Parameters<typeof Badge>[0]["tone"]> = {
  Partner: "violet",
  Manager: "indigo",
  Accountant: "blue",
  "Article Assistant": "amber",
  Admin: "slate",
};

type FormState = Partial<Staff>;

export default function StaffPage() {
  const { can } = useAuth();
  const canManage = can("manageTeam");
  const { data, loading, error, refresh } = useResource<Staff[]>("/api/staff");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [toDelete, setToDelete] = useState<Staff | null>(null);

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Partners, managers and staff of the firm"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Member
            </Button>
          ) : undefined
        }
      />

      {!canManage && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
          You have view-only access to the team. Only Partners and Admins can add
          or edit members and set login access.
        </div>
      )}

      {loading && !data ? (
        <Loading label="Loading team…" />
      ) : error ? (
        <p className="text-sm text-rose-600">Failed to load: {error}</p>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState icon={UsersRound} title="No team members yet" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                    {initials(s.name)}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{s.name}</p>
                    <Badge tone={ROLE_TONE[s.role] ?? "slate"} className="mt-1">
                      {s.role}
                    </Badge>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditing(s);
                        setFormOpen(true);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setToDelete(s)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                <p className="flex items-center gap-2 truncate">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" /> {s.email}
                </p>
                {s.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" /> {s.phone}
                  </p>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">
                  <span className="font-medium text-slate-800">{s._count?.tasks ?? 0}</span> open tasks
                </span>
                <Badge tone={s.active ? "green" : "slate"}>
                  {s.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {formOpen && (
        <StaffForm
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
        title={`Remove ${toDelete?.name}?`}
        message="They will be unassigned from any tasks and removed from the team."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/staff/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function StaffForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Staff | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? { role: "Accountant", active: true },
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial;
  const set = (k: keyof FormState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone,
        active: form.active ?? true,
        ...(password ? { password } : {}),
      };
      if (isEdit) await apiMutate(`/api/staff/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/staff", "POST", payload);
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
      title={isEdit ? "Edit Team Member" : "Add Team Member"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.name || !form.email}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add member"}
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
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Email" required className="sm:col-span-2">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Role">
          <Select value={form.role ?? ""} onChange={(e) => set("role", e.target.value)}>
            {STAFF_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Phone">
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Status">
          <Select
            value={form.active === false ? "Inactive" : "Active"}
            onChange={(e) => set("active", e.target.value === "Active")}
          >
            <option>Active</option>
            <option>Inactive</option>
          </Select>
        </Field>
        <Field
          label={isEdit ? "Reset password" : "Login password"}
          hint={
            isEdit
              ? "Leave blank to keep the current password."
              : "Optional. Min 6 characters. Blank = no sign-in access yet."
          }
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Modal>
  );
}
