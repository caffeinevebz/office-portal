"use client";

import { useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Star,
  Upload,
  X,
  Landmark,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Organization } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";

type FormState = Partial<Organization>;

export default function SettingsPage() {
  const { can } = useAuth();
  const canManage = can("manageOrgs");
  const { data, loading, error, refresh } = useResource<Organization[]>("/api/orgs");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [toDelete, setToDelete] = useState<Organization | null>(null);
  const [logoBusy, setLogoBusy] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoTarget, setLogoTarget] = useState<string | null>(null);
  // bump to bust the browser cache of logo images after upload/remove
  const [logoVersion, setLogoVersion] = useState(0);

  function pickLogo(orgId: string) {
    setLogoTarget(orgId);
    setLogoErr(null);
    fileRef.current?.click();
  }

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !logoTarget) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setLogoErr("The logo must be a PNG or JPEG image.");
      return;
    }
    if (file.size > 512 * 1024) {
      setLogoErr("The logo must be under 512 KB.");
      return;
    }
    setLogoBusy(logoTarget);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Could not read the file"));
        r.readAsDataURL(file);
      });
      await apiMutate(`/api/orgs/${logoTarget}/logo`, "PUT", { dataUrl });
      setLogoVersion((v) => v + 1);
      refresh();
    } catch (err) {
      setLogoErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLogoBusy(null);
      setLogoTarget(null);
    }
  }

  async function removeLogo(orgId: string) {
    setLogoBusy(orgId);
    try {
      await apiMutate(`/api/orgs/${orgId}/logo`, "DELETE");
      setLogoVersion((v) => v + 1);
      refresh();
    } finally {
      setLogoBusy(null);
    }
  }

  async function makeDefault(orgId: string) {
    await apiMutate(`/api/orgs/${orgId}/default`, "POST");
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Firm Settings"
        subtitle="Billing organizations, letterhead details and logo"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Organization
            </Button>
          ) : undefined
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={onLogoFile}
      />

      {!canManage && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
          You have view-only access. Only Partners and Admins can change firm
          settings.
        </div>
      )}
      {logoErr && (
        <div className="mb-4 rounded-lg bg-rose-50 px-4 py-2.5 text-xs text-rose-700 ring-1 ring-rose-200">
          {logoErr}
        </div>
      )}

      {loading && !data ? (
        <Loading label="Loading organizations…" />
      ) : error ? (
        <p className="text-sm text-rose-600">Failed to load: {error}</p>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Landmark}
            title="No organizations configured"
            message="Add the entity your invoices are billed under — its details become the app branding and PDF letterhead."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((o) => (
            <Card key={o.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {o.hasLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/orgs/${o.id}/logo?v=${logoVersion}`}
                      alt=""
                      className="h-12 w-12 rounded-lg bg-white object-contain ring-1 ring-slate-200"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                      <Building2 className="h-6 w-6" />
                    </span>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{o.name}</p>
                      {o.isDefault && (
                        <Badge tone="indigo">
                          <Star className="h-3 w-3" /> Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{o.tagline}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {[o.pan && `PAN ${o.pan}`, o.gstin && `GSTIN ${o.gstin}`]
                        .filter(Boolean)
                        .join(" · ") || "No registrations recorded"}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditing(o);
                        setFormOpen(true);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!o.isDefault && (
                      <button
                        onClick={() => setToDelete(o)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {o.address && (
                <p className="mt-3 text-xs whitespace-pre-line text-slate-500">
                  {o.address}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                {o.bankName && <span>Bank: {o.bankName}</span>}
                {o.bankAccount && <span>A/C: {o.bankAccount}</span>}
                {o.bankIfsc && <span>IFSC: {o.bankIfsc}</span>}
                {o.bankUpi && <span>UPI: {o.bankUpi}</span>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">
                  {o._count?.invoices ?? 0} invoice(s)
                </span>
                <span className="flex-1" />
                {canManage && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => pickLogo(o.id)} disabled={logoBusy === o.id}>
                      <Upload className="h-3.5 w-3.5" />
                      {logoBusy === o.id ? "Uploading…" : o.hasLogo ? "Replace logo" : "Upload logo"}
                    </Button>
                    {o.hasLogo && (
                      <Button size="sm" variant="ghost" onClick={() => removeLogo(o.id)} disabled={logoBusy === o.id}>
                        <X className="h-3.5 w-3.5" /> Remove logo
                      </Button>
                    )}
                    {!o.isDefault && (
                      <Button size="sm" variant="secondary" onClick={() => makeDefault(o.id)}>
                        <Star className="h-3.5 w-3.5" /> Make default
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {formOpen && (
        <OrgForm
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
        message="Existing invoices keep their data but lose the link to this organization."
        onConfirm={async () => {
          if (toDelete) await apiMutate(`/api/orgs/${toDelete.id}`, "DELETE");
          refresh();
        }}
      />
    </div>
  );
}

function OrgForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Organization | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? { tagline: "Chartered Accountants", sacCode: "9982" },
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
        name: form.name,
        tagline: form.tagline || "Chartered Accountants",
        address: form.address,
        phone: form.phone,
        email: form.email,
        pan: form.pan,
        gstin: form.gstin,
        sacCode: form.sacCode || "9982",
        bankName: form.bankName,
        bankAccount: form.bankAccount,
        bankIfsc: form.bankIfsc,
        bankUpi: form.bankUpi,
        invoiceNote: form.invoiceNote,
      };
      if (isEdit) await apiMutate(`/api/orgs/${initial!.id}`, "PUT", payload);
      else await apiMutate("/api/orgs", "POST", payload);
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
      title={isEdit ? `Edit ${initial!.name}` : "New Organization"}
      description="These details appear on the app branding (if default) and on invoice PDFs billed under this entity."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.name}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create organization"}
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
        <Field label="Firm / entity name" required>
          <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Tagline">
          <Input value={form.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
        <Field label="Letterhead address" hint="One line per row" className="sm:col-span-2">
          <Textarea
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="PAN">
          <Input value={form.pan ?? ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} maxLength={10} />
        </Field>
        <Field label="GSTIN" hint="Its state code drives CGST/SGST vs IGST">
          <Input value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} />
        </Field>
        <Field label="SAC code">
          <Input value={form.sacCode ?? ""} onChange={(e) => set("sacCode", e.target.value)} />
        </Field>
        <Field label="Bank name & branch">
          <Input value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
        </Field>
        <Field label="Account number">
          <Input value={form.bankAccount ?? ""} onChange={(e) => set("bankAccount", e.target.value)} />
        </Field>
        <Field label="IFSC">
          <Input value={form.bankIfsc ?? ""} onChange={(e) => set("bankIfsc", e.target.value.toUpperCase())} />
        </Field>
        <Field label="UPI ID">
          <Input value={form.bankUpi ?? ""} onChange={(e) => set("bankUpi", e.target.value)} />
        </Field>
        <Field label="Invoice footer note" className="sm:col-span-2">
          <Textarea
            value={form.invoiceNote ?? ""}
            onChange={(e) => set("invoiceNote", e.target.value)}
            placeholder="Payment terms shown at the bottom of invoices"
          />
        </Field>
      </div>
    </Modal>
  );
}
