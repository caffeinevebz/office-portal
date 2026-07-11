"use client";

import { Fragment, useState } from "react";
import { ShieldCheck, Plus, Trash2, Check, Lock, Users } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { RolesResponse, RoleInfo, PermissionMeta } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Loading } from "@/components/ui/EmptyState";
import { cn } from "@/lib/format";

export default function AccessPage() {
  const { can } = useAuth();
  const canManage = can("manageRoles");
  const { data, loading, error, refresh, setData } = useResource<RolesResponse>("/api/roles");
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<RoleInfo | null>(null);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Access Control" subtitle="Roles and permissions" />
        <Card className="p-6 text-sm text-slate-500">
          You don&apos;t have permission to manage roles. Ask a partner or admin
          for access.
        </Card>
      </div>
    );
  }

  async function toggle(role: RoleInfo, permKey: string, allowed: boolean) {
    // Optimistic update, then persist.
    setData((prev) =>
      prev
        ? {
            ...prev,
            roles: prev.roles.map((r) =>
              r.name === role.name
                ? {
                    ...r,
                    permissions: allowed
                      ? [...new Set([...r.permissions, permKey])]
                      : r.permissions.filter((p) => p !== permKey),
                  }
                : r,
            ),
          }
        : prev,
    );
    try {
      await apiMutate(`/api/roles/${encodeURIComponent(role.name)}`, "PATCH", {
        permission: permKey,
        allowed,
      });
    } catch {
      refresh();
    }
  }

  const roles = data?.roles ?? [];
  const permissions = data?.permissions ?? [];
  const categories = data?.categories ?? [];
  const byCategory = (cat: string) => permissions.filter((p) => p.category === cat);

  return (
    <div>
      <PageHeader
        title="Access Control"
        subtitle="Create user categories and set what each can do"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add role
          </Button>
        }
      />

      <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs text-brand-800">
        Tick a box to grant a permission to that role. The{" "}
        <span className="font-semibold">Partner</span> role is the super-admin and
        always keeps full access. Custom roles you add appear as their own column.
      </div>

      {loading && !data ? (
        <Loading label="Loading roles…" />
      ) : error ? (
        <Card className="p-6 text-sm text-rose-600">Failed to load: {error}</Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-xs font-medium text-slate-500">
                    Permission
                  </th>
                  {roles.map((r) => (
                    <th key={r.name} className="px-3 py-3 align-bottom">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-semibold text-slate-800">{r.name}</span>
                        {r.isSuperadmin ? (
                          <Badge tone="violet">Super-admin</Badge>
                        ) : r.isSystem ? (
                          <Badge tone="indigo">Built-in</Badge>
                        ) : (
                          <Badge tone="blue">Custom</Badge>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-400">
                          <Users className="h-3 w-3" /> {r.staffCount}
                        </span>
                        {!r.isSystem && (
                          <button
                            onClick={() => setToDelete(r)}
                            className="rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                            title={`Delete ${r.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const perms = byCategory(cat);
                  if (perms.length === 0) return null;
                  return (
                    <Fragment key={cat}>
                      <tr className="bg-slate-50/70">
                        <td
                          colSpan={roles.length + 1}
                          className="sticky left-0 px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase"
                        >
                          {cat}
                        </td>
                      </tr>
                      {perms.map((perm) => (
                        <tr
                          key={perm.key}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                        >
                          <td className="sticky left-0 z-10 bg-white px-4 py-2.5 text-slate-700">
                            {perm.label}
                          </td>
                          {roles.map((r) => (
                            <td key={r.name} className="px-3 py-2.5 text-center">
                              <PermToggle
                                on={r.isSuperadmin || r.permissions.includes(perm.key)}
                                locked={r.isSuperadmin}
                                onChange={(next) => toggle(r, perm.key, next)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {addOpen && (
        <AddRoleModal
          existing={roles.map((r) => r.name)}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete the ${toDelete?.name} role?`}
        message={
          toDelete && toDelete.staffCount > 0
            ? `${toDelete.staffCount} member(s) still use this role. Reassign them first, then delete.`
            : "This removes the role and its custom access settings."
        }
        confirmLabel="Delete role"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await apiMutate(`/api/roles/${encodeURIComponent(toDelete.name)}`, "DELETE");
            refresh();
          } catch {
            refresh();
          }
        }}
      />
    </div>
  );
}

function PermToggle({
  on,
  locked,
  onChange,
}: {
  on: boolean;
  locked: boolean;
  onChange: (next: boolean) => void;
}) {
  if (locked) {
    return (
      <span
        title="The Partner role always has full access"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-400"
      >
        <Lock className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md ring-1 transition-colors",
        on
          ? "bg-fern-500 text-white ring-fern-500 hover:bg-fern-600"
          : "bg-white text-transparent ring-slate-300 hover:ring-brand-400 hover:text-brand-200",
      )}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

function AddRoleModal({
  existing,
  onClose,
  onCreated,
}: {
  existing: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clash = existing.some((e) => e.toLowerCase() === name.trim().toLowerCase());

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await apiMutate("/api/roles", "POST", {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a user category"
      description="New roles start with no permissions. Grant access from the grid."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim() || clash}>
            {busy ? "Creating…" : "Create role"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      <div className="space-y-4">
        <Field
          label="Role name"
          required
          hint={clash ? "A role with that name already exists." : undefined}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Audit Associate"
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this category is for (optional)"
          />
        </Field>
      </div>
    </Modal>
  );
}
