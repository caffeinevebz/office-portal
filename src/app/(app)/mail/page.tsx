"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Search,
  RefreshCw,
  Paperclip,
  Reply,
  ReplyAll,
  PenLine,
  Building2,
  ClipboardList,
  AlertTriangle,
  Send,
  X,
  Download,
} from "lucide-react";
import { useResource, useDebounced, apiMutate } from "@/lib/useApi";
import { useAuth } from "@/lib/auth/context";
import type { Client, Task, MailListItem, MailFull, MailSyncState } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/format";

type View = "All" | "Unread" | "Unfiled" | "Sent";
const VIEWS: View[] = ["All", "Unread", "Unfiled", "Sent"];

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

const fullWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Who a message is from, in the fewest words that still identify them. */
const who = (m: { fromName: string | null; fromEmail: string | null }) =>
  m.fromName?.trim() || m.fromEmail || "Unknown sender";

export default function MailPage() {
  const { can } = useAuth();
  const canManage = can("manageMail");

  const [view, setView] = useState<View>("All");
  const [q, setQ] = useState("");
  const qd = useDebounced(q);
  const [client, setClient] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [compose, setCompose] = useState<null | { replyTo: MailFull | null; all: boolean }>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const url = `/api/mail?view=${view}&q=${encodeURIComponent(qd)}&clientId=${encodeURIComponent(client)}`;
  const { data, loading, error, refresh } = useResource<MailListItem[]>(url);
  const { data: clients } = useResource<Client[]>("/api/clients?slim=1");
  const { data: sync, refresh: refreshSync } = useResource<MailSyncState>("/api/mail/sync");
  const open = useResource<MailFull>(openId ? `/api/mail/${openId}` : null);

  // Opening a message marks it read, which changes the list behind the pane.
  useEffect(() => {
    if (open.data) refresh();
    // Only when the opened message changes, not on every list refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.data?.id]);

  async function runSync() {
    setSyncing(true);
    setNotice(null);
    try {
      const res = (await apiMutate("/api/mail/sync", "POST")) as { status: string };
      setNotice(res.status);
      refresh();
      refreshSync();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not read the mailbox");
    } finally {
      setSyncing(false);
    }
  }

  const rows = data ?? [];
  const unfiled = useMemo(
    () => (data ?? []).filter((m) => m.direction === "Incoming" && !m.client).length,
    [data],
  );

  return (
    <div>
      <PageHeader
        title="Mail"
        subtitle={
          sync?.mailbox
            ? `The firm's mailbox — ${sync.mailbox.user}`
            : "The firm's official mailbox, filed against the clients it concerns"
        }
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={runSync} disabled={syncing || !sync?.enabled}>
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                {syncing ? "Fetching…" : "Fetch mail"}
              </Button>
              <Button onClick={() => setCompose({ replyTo: null, all: false })}>
                <PenLine className="h-4 w-4" /> Write
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Sync isn't set up (or is switched off) — say so, and where to fix it. */}
      {sync && !sync.enabled && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {sync.missing ?? "Inbox sync is switched off."} Turn it on under{" "}
            <Link href="/settings" className="font-medium underline underline-offset-2">
              Firm Settings → Official firm email
            </Link>
            . Mail written here still goes out; only fetching needs the mailbox.
          </p>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>
      )}

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search subject, sender or client…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="All">All clients</option>
            <option value="None">Not filed against a client</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
                view === v
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {v}
              {v === "Unfiled" && unfiled > 0 && view !== "Unfiled" ? ` ${unfiled}` : ""}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card className="overflow-hidden">
          {loading && !data ? (
            <Loading label="Loading mail…" />
          ) : error ? (
            <p className="p-4 text-sm text-rose-600">{error}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nothing here"
              message={
                view === "Unfiled"
                  ? "Every message has been filed against a client."
                  : sync?.enabled
                    ? "Press Fetch mail to bring in what has arrived."
                    : "Inbox sync is off, so nothing has been fetched yet."
              }
            />
          ) : (
            <ul className="max-h-[calc(100vh-22rem)] divide-y divide-slate-50 overflow-y-auto">
              {rows.map((m) => {
                const unread = m.direction === "Incoming" && !m.readAt;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => setOpenId(m.id)}
                      className={cn(
                        "w-full px-3 py-2.5 text-left hover:bg-slate-50",
                        openId === m.id && "bg-brand-50/60",
                      )}
                    >
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread ? "font-semibold text-slate-900" : "text-slate-700",
                          )}
                        >
                          {m.direction === "Sent"
                            ? `To ${(m.toEmails ?? []).join(", ") || "—"}`
                            : who(m)}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                          {when(m.sentAt)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block truncate text-xs",
                          unread ? "font-medium text-slate-800" : "text-slate-500",
                        )}
                      >
                        {m.subject || "(no subject)"}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                        {m.snippet}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {m.client ? (
                          <Badge tone="brand">
                            <Building2 className="mr-1 inline h-3 w-3" />
                            {m.client.name}
                          </Badge>
                        ) : m.direction === "Incoming" ? (
                          <Badge tone="amber">Not filed</Badge>
                        ) : null}
                        {m.task && (
                          <Badge tone="slate">
                            <ClipboardList className="mr-1 inline h-3 w-3" />
                            {m.task.title}
                          </Badge>
                        )}
                        {m.attachmentCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400">
                            <Paperclip className="h-3 w-3" />
                            {m.attachmentCount}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="min-h-[24rem] overflow-hidden">
          {!openId ? (
            <EmptyState
              icon={Mail}
              title="No message open"
              message="Pick a message on the left to read it."
            />
          ) : open.loading && !open.data ? (
            <Loading label="Opening…" />
          ) : !open.data ? (
            <p className="p-4 text-sm text-rose-600">{open.error ?? "Could not open it."}</p>
          ) : (
            <MailReader
              mail={open.data}
              clients={clients ?? []}
              canManage={canManage}
              onChanged={(msg) => {
                if (msg) setNotice(msg);
                open.refresh();
                refresh();
              }}
              onReply={(all) => setCompose({ replyTo: open.data!, all })}
            />
          )}
        </Card>
      </div>

      {compose && (
        <ComposeModal
          replyTo={compose.replyTo}
          replyAll={compose.all}
          clients={clients ?? []}
          ownAddress={sync?.mailbox?.user ?? null}
          onClose={() => setCompose(null)}
          onSent={(msg) => {
            setCompose(null);
            setNotice(msg);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MailReader({
  mail,
  clients,
  canManage,
  onChanged,
  onReply,
}: {
  mail: MailFull;
  clients: Client[];
  canManage: boolean;
  onChanged: (notice: string | null) => void;
  onReply: (all: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  // The client's engagements, so the message can be attached to one.
  const { data: tasks } = useResource<Task[]>(
    mail.client ? `/api/tasks?clientId=${mail.client.id}&view=Active` : null,
  );

  async function file(clientId: string | null) {
    setBusy(true);
    try {
      const res = (await apiMutate(`/api/mail/${mail.id}`, "PATCH", { clientId })) as {
        alsoFiled: number;
      };
      onChanged(
        clientId && res.alsoFiled > 0
          ? `Filed. ${res.alsoFiled} earlier message${res.alsoFiled === 1 ? "" : "s"} from this address ${res.alsoFiled === 1 ? "was" : "were"} filed too.`
          : null,
      );
    } finally {
      setBusy(false);
    }
  }

  async function attach(taskId: string | null) {
    setBusy(true);
    try {
      await apiMutate(`/api/mail/${mail.id}`, "PATCH", { taskId });
      onChanged(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <h2 className="text-base font-semibold text-slate-900">{mail.subject || "(no subject)"}</h2>
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-medium">{who(mail)}</span>
          {mail.fromEmail && mail.fromName ? (
            <span className="text-slate-400"> &lt;{mail.fromEmail}&gt;</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          To {(mail.toEmails ?? []).join(", ") || "—"}
          {mail.ccEmails?.length ? ` · cc ${mail.ccEmails.join(", ")}` : ""}
          {mail.sentAt ? ` · ${fullWhen(mail.sentAt)}` : ""}
        </p>

        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => onReply(false)}>
              <Reply className="h-4 w-4" /> Reply
            </Button>
            <Button variant="secondary" onClick={() => onReply(true)}>
              <ReplyAll className="h-4 w-4" /> Reply all
            </Button>
          </div>
        )}

        {canManage && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Filed against"
              hint={
                mail.matchedBy === "auto"
                  ? "Matched on the sender's address"
                  : mail.matchedBy === "manual"
                    ? "Filed by hand — this address now files itself"
                    : "Not filed against any client yet"
              }
            >
              <Select
                value={mail.client?.id ?? ""}
                disabled={busy}
                onChange={(e) => file(e.target.value || null)}
              >
                <option value="">— No client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Attached to task"
              hint={mail.client ? "This client's open engagements" : "Pick a client first"}
            >
              <Select
                value={mail.task?.id ?? ""}
                disabled={busy || !mail.client}
                onChange={(e) => attach(e.target.value || null)}
              >
                <option value="">— None —</option>
                {(tasks ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {mail.truncated && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            This message was too large to store whole. What follows is the opening of it — open it
            in your mail client to read the rest.
          </p>
        )}
        {mail.htmlBody ? (
          // Sanitised on the way in: scripts, styles, frames, handlers and
          // remote images are stripped before it is ever stored.
          <div
            className="prose prose-sm max-w-none text-slate-800 [&_a]:text-brand-700 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: mail.htmlBody }}
          />
        ) : (
          <pre className="font-sans text-sm break-words whitespace-pre-wrap text-slate-800">
            {mail.textBody || mail.snippet || "(empty message)"}
          </pre>
        )}

        {mail.attachments.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">
              {mail.attachments.length} attachment{mail.attachments.length === 1 ? "" : "s"}
            </p>
            <ul className="flex flex-wrap gap-2">
              {mail.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/mail/${mail.id}/attachments/${a.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm hover:border-brand-300 hover:text-brand-700"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-400" />
                    <span className="max-w-[14rem] truncate">{a.filename}</span>
                    <span className="text-slate-400">{fileSize(a.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const listOf = (v: string) =>
  v
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function ComposeModal({
  replyTo,
  replyAll,
  clients,
  ownAddress,
  onClose,
  onSent,
}: {
  replyTo: MailFull | null;
  replyAll: boolean;
  clients: Client[];
  ownAddress: string | null;
  onClose: () => void;
  onSent: (notice: string) => void;
}) {
  // A reply opens addressed and quoted; a fresh message opens empty.
  const initial = useMemo(() => {
    if (!replyTo) return { to: "", cc: "", subject: "", body: "", clientId: "" };
    const own = (ownAddress ?? "").toLowerCase();
    const others = replyAll
      ? [...(replyTo.toEmails ?? []), ...(replyTo.ccEmails ?? [])]
          .map((a) => a.toLowerCase())
          .filter((a) => a && a !== own && a !== replyTo.fromEmail?.toLowerCase())
      : [];
    const subject = (replyTo.subject ?? "").trim() || "(no subject)";
    const quoted = (replyTo.textBody ?? replyTo.snippet ?? "")
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    return {
      to: replyTo.fromEmail ?? "",
      cc: [...new Set(others)].join(", "),
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      body: `\n\nOn ${fullWhen(replyTo.sentAt)}, ${who(replyTo)} wrote:\n${quoted}`,
      clientId: replyTo.client?.id ?? "",
    };
  }, [replyTo, replyAll, ownAddress]);

  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiMutate("/api/mail", "POST", {
        to: listOf(form.to),
        cc: listOf(form.cc),
        subject: form.subject,
        body: form.body,
        replyToId: replyTo?.id ?? null,
        clientId: form.clientId || null,
      })) as { status: string };
      onSent(
        res.status === "Simulated"
          ? "Recorded, but not actually sent — no mail credentials are configured yet."
          : `Sent to ${listOf(form.to).join(", ")}.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={replyTo ? (replyAll ? "Reply to all" : "Reply") : "New message"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={send}
            disabled={busy || listOf(form.to).length === 0 || !form.subject.trim() || !form.body.trim()}
          >
            <Send className="h-4 w-4" /> {busy ? "Sending…" : "Send"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      {replyTo && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
          Threaded under “{replyTo.subject || "(no subject)"}”, so your answer lands beneath their
          message in their mail client.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4">
        <Field label="To" required hint="Separate several addresses with commas">
          <Input value={form.to} onChange={(e) => set("to", e.target.value)} placeholder="client@example.com" />
        </Field>
        <Field label="Cc">
          <Input value={form.cc} onChange={(e) => set("cc", e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Subject" required>
          <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} />
        </Field>
        <Field label="File against" hint="The sent copy joins this client's mail">
          <Select value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">— Decide from the address —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Message" required>
          <Textarea rows={12} value={form.body} onChange={(e) => set("body", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
