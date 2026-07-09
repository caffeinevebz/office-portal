"use client";

import { useState } from "react";
import {
  Send,
  Mail,
  MessageCircle,
  User,
  Building2,
  Info,
  Clock,
  BellRing,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { ReminderSettings, ReminderCandidate, NotificationLog } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, dueLabel, daysUntil, cn } from "@/lib/format";

type Preview = {
  candidates: ReminderCandidate[];
  provider: { email: string; whatsapp: string; live: boolean };
  settings: ReminderSettings;
};

const channelTone = (c: string) => (c === "Email" ? "blue" : "green");
const statusTone = (s: string) =>
  s === "Sent" ? "green" : s === "Failed" ? "red" : "amber";

export default function RemindersPage() {
  const { can } = useAuth();
  const canManage = can("manageReminders");
  const preview = useResource<Preview>("/api/reminders/preview");
  const log = useResource<NotificationLog[]>("/api/reminders/log");

  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function refreshAll() {
    preview.refresh();
    log.refresh();
  }

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    try {
      const r = (await apiMutate("/api/reminders/run", "POST")) as {
        total: number;
        sent: number;
        simulated: number;
        failed: number;
        skipped: number;
      };
      const parts = [];
      if (r.sent) parts.push(`${r.sent} sent`);
      if (r.simulated) parts.push(`${r.simulated} simulated`);
      if (r.failed) parts.push(`${r.failed} failed`);
      if (r.skipped) parts.push(`${r.skipped} already sent today`);
      setRunMsg(
        r.total === 0
          ? "No reminders are due right now."
          : `Processed ${r.total} reminder${r.total === 1 ? "" : "s"}: ${parts.join(", ")}.`,
      );
      refreshAll();
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  const data = preview.data;

  return (
    <div>
      <PageHeader
        title="Deadline Reminders"
        subtitle="Email & WhatsApp nudges for upcoming and overdue compliance"
        actions={
          canManage ? (
            <Button onClick={runNow} disabled={running}>
              <Send className="h-4 w-4" />
              {running ? "Sending…" : "Send reminders now"}
            </Button>
          ) : undefined
        }
      />

      {preview.loading && !data ? (
        <Loading label="Loading reminders…" />
      ) : preview.error || !data ? (
        <p className="text-sm text-rose-600">Failed to load: {preview.error}</p>
      ) : (
        <div className="space-y-4">
          {/* Provider status */}
          <div
            className={cn(
              "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
              data.provider.live
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {data.provider.live ? (
                <p>Live delivery is configured. Reminders are sent for real.</p>
              ) : (
                <p>
                  <strong>Simulation mode.</strong> Messages are fully rendered and
                  logged but not actually delivered. Set{" "}
                  <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code> (email)
                  or <code className="rounded bg-amber-100 px-1">WHATSAPP_TOKEN</code> +{" "}
                  <code className="rounded bg-amber-100 px-1">WHATSAPP_PHONE_ID</code> to
                  go live.
                </p>
              )}
              <p className="mt-0.5 text-xs opacity-80">
                Email: {data.provider.email} · WhatsApp: {data.provider.whatsapp}
              </p>
            </div>
          </div>

          {runMsg && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              {runMsg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Settings */}
            <div className="lg:col-span-1">
              <SettingsCard
                initial={data.settings}
                canManage={canManage}
                onSaved={refreshAll}
              />
              <p className="mt-2 flex items-start gap-1.5 px-1 text-xs text-slate-400">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Point a daily scheduler at <code>POST /api/reminders/run</code> to
                automate this — it&apos;s safe to call repeatedly.
              </p>
            </div>

            {/* Upcoming preview */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="Upcoming reminders"
                subtitle={
                  data.settings.enabled
                    ? `${data.candidates.length} message(s) queued for tasks due within ${data.settings.leadDays} day(s) or overdue`
                    : "Reminders are turned off"
                }
              />
              {data.candidates.length === 0 ? (
                <EmptyState
                  icon={BellRing}
                  title="Nothing to send"
                  message="No open tasks fall within the reminder window right now."
                />
              ) : (
                <div className="max-h-[26rem] overflow-y-auto">
                  <ul className="divide-y divide-slate-100">
                    {data.candidates.map((c, i) => {
                      const overdue = (daysUntil(c.dueDate) ?? 0) < 0;
                      return (
                        <li key={i} className="flex items-start gap-3 px-5 py-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            {c.recipientType === "Client" ? (
                              <Building2 className="h-4 w-4" />
                            ) : (
                              <User className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-slate-800">
                                {c.recipientName}
                              </span>
                              <Badge tone={channelTone(c.channel)}>
                                {c.channel === "Email" ? (
                                  <Mail className="h-3 w-3" />
                                ) : (
                                  <MessageCircle className="h-3 w-3" />
                                )}
                                {c.channel}
                              </Badge>
                              <span className="text-xs text-slate-400">{c.to}</span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-600">
                              {c.taskTitle}
                              {c.clientName ? ` · ${c.clientName}` : ""}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 text-xs font-medium",
                              overdue ? "text-rose-600" : "text-slate-500",
                            )}
                          >
                            {dueLabel(c.dueDate)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          {/* Log */}
          <Card>
            <CardHeader
              title="Delivery log"
              subtitle="Most recent reminders sent or simulated"
            />
            {log.loading && !log.data ? (
              <Loading label="Loading log…" />
            ) : !log.data || log.data.length === 0 ? (
              <EmptyState title="No reminders sent yet" message="Run the reminders to populate this log." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                      <th className="px-5 py-3">When</th>
                      <th className="px-5 py-3">Channel</th>
                      <th className="px-5 py-3">Recipient</th>
                      <th className="px-5 py-3">Subject</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {log.data.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                          {formatDate(l.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={channelTone(l.channel)}>{l.channel}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-slate-700">{l.recipientName}</span>
                          <span className="block text-xs text-slate-400">{l.to}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="block max-w-xs truncate text-slate-600">
                            {l.subject}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className={cn("flex items-center justify-between gap-3", disabled && "opacity-70")}>
      <span>
        <span className="block text-sm text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
          checked ? "bg-indigo-600" : "bg-slate-300",
        )}
        aria-pressed={checked}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </label>
  );
}

function SettingsCard({
  initial,
  canManage,
  onSaved,
}: {
  initial: ReminderSettings;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof ReminderSettings>(k: K, v: ReminderSettings[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    try {
      await apiMutate("/api/reminders/settings", "PUT", {
        enabled: s.enabled,
        leadDays: s.leadDays,
        notifyAssignee: s.notifyAssignee,
        notifyClient: s.notifyClient,
        channelEmail: s.channelEmail,
        channelWhatsapp: s.channelWhatsapp,
      });
      setSaved(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Settings" subtitle="Who gets reminded, and how" />
      <div className="space-y-4 p-5">
        <Toggle
          label="Reminders enabled"
          checked={s.enabled}
          disabled={!canManage}
          onChange={(v) => set("enabled", v)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">Remind when due within</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={60}
              value={s.leadDays}
              disabled={!canManage}
              onChange={(e) => set("leadDays", Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
            />
            <span className="text-sm text-slate-500">days</span>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Recipients</p>
          <div className="space-y-2.5">
            <Toggle label="The assigned staff member" checked={s.notifyAssignee} disabled={!canManage} onChange={(v) => set("notifyAssignee", v)} />
            <Toggle label="The client" hint="Uses the client's contact details" checked={s.notifyClient} disabled={!canManage} onChange={(v) => set("notifyClient", v)} />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Channels</p>
          <div className="space-y-2.5">
            <Toggle label="Email" checked={s.channelEmail} disabled={!canManage} onChange={(v) => set("channelEmail", v)} />
            <Toggle label="WhatsApp" checked={s.channelWhatsapp} disabled={!canManage} onChange={(v) => set("channelWhatsapp", v)} />
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
            <Button onClick={save} disabled={busy} size="sm">
              {busy ? "Saving…" : "Save settings"}
            </Button>
            {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
