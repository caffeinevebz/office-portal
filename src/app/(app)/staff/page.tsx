"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Mail, Phone, UsersRound, Send, Copy, Clock, Ban } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Staff, Invitation } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { initials, formatDate } from "@/lib/format";

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
  const { data: roles } = useResource<string[]>("/api/roles/names");
  const invites = useResource<Invitation[]>("/api/invitations");
  const [formOpen, setFormOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [toDelete, setToDelete] = useState<Staff | null>(null);

  const pendingInvites = (invites.data ?? []).filter((i) => i.status === "Pending");

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Partners, managers and staff of the firm"
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                <Send className="h-4 w-4" /> Invite by email
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Member
              </Button>
            </>
          ) : undefined
        }
      />

      {!canManage && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
          You have view-only access to the team. Only members with the team
          permission can add, invite or edit members.
        </div>
      )}

      {canManage && pendingInvites.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Pending invitations" subtitle={`${pendingInvites.length} awaiting acceptance`} />
          <ul className="divide-y divide-slate-100">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <Mail className="h-3.5 w-3.5 text-slate-400" /> {inv.email}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {inv.role} · invited by {inv.invitedBy} ·{" "}
                    {inv.expired ? (
                      <span className="text-rose-600">expired</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> expires {formatDate(inv.expiresAt)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await apiMutate(`/api/invitations/${inv.id}`, "DELETE");
                    invites.refresh();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                >
                  <Ban className="h-3.5 w-3.5" /> Revoke
                </button>
              </li>
            ))}
          </ul>
        </Card>
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
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
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
          roles={roles ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {inviteOpen && (
        <InviteModal
          roles={roles ?? []}
          onClose={() => setInviteOpen(false)}
          onSent={() => invites.refresh()}
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
  roles,
  onClose,
  onSaved,
}: {
  initial: Staff | null;
  roles: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? { role: roles[0] ?? "Accountant", active: true },
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
            {roles.map((r) => (
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

function InviteModal({
  roles,
  onClose,
  onSent,
}: {
  roles: string[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(roles[0] ?? "Accountant");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; delivery: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiMutate("/api/invitations", "POST", { email, name, role })) as {
        link: string;
        delivery: string;
      };
      setResult({ link: res.link, delivery: res.delivery });
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite a team member"
      description="They'll get a link to set their password and activate their account."
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={send} disabled={busy || !email}>
              <Send className="h-4 w-4" />
              {busy ? "Sending…" : "Send invitation"}
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

      {result ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-fern-50 px-3 py-2 text-sm text-fern-800 ring-1 ring-fern-200">
            Invitation created
            {result.delivery === "Sent"
              ? " and emailed."
              : " — email delivery is simulated, so share this link with the invitee:"}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">
              {result.link}
            </span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(result.link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-brand-600 ring-1 ring-slate-200 hover:bg-brand-50"
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" required className="sm:col-span-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firm.in" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
