"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  FileText,
  Receipt,
  ClipboardList,
  Send,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { ClientDetail } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Loading } from "@/components/ui/EmptyState";
import {
  formatCurrency,
  formatDate,
  dueLabel,
  daysUntil,
  initials,
  invoiceGross,
  cn,
} from "@/lib/format";
import {
  CLIENT_STATUS_TONE,
  CATEGORY_TONE,
  TASK_STATUS_TONE,
  INVOICE_STATUS_TONE,
} from "@/lib/constants";

const withTax = (i: { amount: number; taxRate: number; gstMode?: string }) =>
  invoiceGross(i.amount, i.taxRate, i.gstMode);

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data: c, loading, error } = useResource<ClientDetail>(
    `/api/clients/${params.id}`,
  );
  const [composeOpen, setComposeOpen] = useState(false);

  if (loading) return <Loading label="Loading client…" />;
  if (error || !c)
    return (
      <div className="text-sm text-rose-600">
        Could not load this client. <Link href="/clients" className="underline">Go back</Link>.
      </div>
    );

  const openTasks = c.tasks.filter((t) => t.status !== "Completed").length;
  const billed = c.invoices.reduce((s, i) => s + withTax(i), 0);
  const outstanding = c.invoices
    .filter((i) => i.status === "Sent" || i.status === "Overdue")
    .reduce((s, i) => s + withTax(i), 0);

  const infoRows = [
    { icon: Mail, value: c.email },
    { icon: Phone, value: c.phone },
    { icon: MapPin, value: c.address },
  ].filter((r) => r.value);

  return (
    <div>
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> All clients
      </Link>

      {/* Header card */}
      <Card className="mb-4">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-100 text-lg font-semibold text-brand-700">
              {initials(c.name)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-900">{c.name}</h1>
                <Badge tone={CLIENT_STATUS_TONE[c.status]}>{c.status}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {c.type}
                {c.contactPerson ? ` · Contact: ${c.contactPerson}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                {c.pan && (
                  <span>
                    PAN <span className="font-mono text-slate-700">{c.pan}</span>
                  </span>
                )}
                {c.gstin && (
                  <span>
                    GSTIN <span className="font-mono text-slate-700">{c.gstin}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <div className="grid grid-cols-3 gap-4 text-center sm:text-right">
              <Stat label="Open Tasks" value={openTasks} />
              <Stat label="Billed" value={formatCurrency(billed)} />
              <Stat label="Outstanding" value={formatCurrency(outstanding)} />
            </div>
            {can("manageClients") && c.email && (
              <Button size="sm" variant="secondary" onClick={() => setComposeOpen(true)}>
                <Send className="h-3.5 w-3.5" /> Send email
              </Button>
            )}
          </div>
        </div>
        {(infoRows.length > 0 || c.notes) && (
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="flex flex-col gap-2 text-sm text-slate-600">
              {infoRows.map((r, i) => (
                <span key={i} className="flex items-center gap-2">
                  <r.icon className="h-4 w-4 text-slate-400" /> {r.value}
                </span>
              ))}
            </div>
            {c.notes && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {c.notes}
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Tasks */}
        <Card>
          <CardHeader
            title="Compliance Tasks"
            subtitle={`${c.tasks.length} total`}
          />
          {c.tasks.length === 0 ? (
            <Empty icon={ClipboardList} label="No tasks for this client." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.tasks.map((t) => {
                const overdue =
                  t.status !== "Completed" && (daysUntil(t.dueDate) ?? 0) < 0;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {t.title}
                        </p>
                        <Badge tone={CATEGORY_TONE[t.category]}>{t.category}</Badge>
                      </div>
                      <p className={cn("mt-0.5 text-xs", overdue ? "text-rose-600" : "text-slate-500")}>
                        {t.dueDate ? dueLabel(t.dueDate) : "No due date"}
                        {t.assignee ? ` · ${t.assignee.name}` : ""}
                      </p>
                    </div>
                    <Badge tone={TASK_STATUS_TONE[t.status]}>{t.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Invoices */}
        <Card>
          <CardHeader title="Invoices" subtitle={`${c.invoices.length} total`} />
          {c.invoices.length === 0 ? (
            <Empty icon={Receipt} label="No invoices raised yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {i.invoiceNumber}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {i.description ?? "—"} · {formatDate(i.issueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-800">
                      {formatCurrency(withTax(i))}
                    </p>
                    <Badge tone={INVOICE_STATUS_TONE[i.status]}>{i.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Documents */}
        <Card className="lg:col-span-2">
          <CardHeader title="Documents" subtitle={`${c.documents.length} on file`} />
          {c.documents.length === 0 ? (
            <Empty icon={FileText} label="No documents recorded." />
          ) : (
            <ul className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
              {c.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 bg-white px-5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{d.name}</p>
                    <p className="text-xs text-slate-500">
                      {d.category}
                      {d.financialYear && d.financialYear !== "-"
                        ? ` · FY ${d.financialYear}`
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {composeOpen && (
        <ComposeEmailModal client={c} onClose={() => setComposeOpen(false)} />
      )}
    </div>
  );
}

function ComposeEmailModal({
  client,
  onClose,
}: {
  client: ClientDetail;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    `Dear ${client.contactPerson || client.name},\n\n`,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiMutate(`/api/clients/${client.id}/email`, "POST", {
        subject,
        body,
      })) as { status: string; to: string };
      setSent(
        res.status === "Sent"
          ? `Email sent to ${res.to}.`
          : `Email simulated and logged for ${res.to} — configure the firm email in Settings to send for real.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Email ${client.name}`}
      description={`To: ${client.email} — sent from the firm's official email`}
      footer={
        sent ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={send} disabled={busy || !subject.trim() || !body.trim()}>
              <Send className="h-4 w-4" /> {busy ? "Sending…" : "Send email"}
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
      {sent ? (
        <div className="rounded-lg bg-fern-50 px-3 py-2 text-sm text-fern-800 ring-1 ring-fern-200">
          {sent}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Subject" required>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Documents required for ITR AY 2026-27"
            />
          </Field>
          <Field label="Message" required hint="Your name and the firm's name are signed automatically.">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function Empty({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
      <Icon className="h-4 w-4" /> {label}
    </div>
  );
}
