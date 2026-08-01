"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Mail, MessageCircle, Scale, Send, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDate, cn } from "@/lib/format";

const LAWS = ["Income Tax", "GST", "MCA"] as const;

type Entry = { law: string; title: string; dueDate: string; notes: string };
type Client = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  reachable: boolean;
};
type Preview = {
  period: string;
  entries: Entry[];
  clients: Client[];
  reachable: { email: number; whatsapp: number; total: number };
  preview: { subject: string; body: string } | null;
};
type Result = { total: number; sent: number; simulated: number; failed: number; skipped: number; period: string };

/** First and last day of a month offset from this one, as yyyy-MM-dd. */
function monthRange(offset: number) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(first), to: iso(last) };
}

/**
 * One circular to every client, listing the statutory due dates falling in a
 * period. The dates come from the built-in Income Tax / GST / MCA calendars,
 * so nobody types them out, and each client gets a single message covering
 * all of them.
 */
export function StatutoryBulletinCard({ canManage, onSent }: { canManage: boolean; onSent: () => void }) {
  const [period, setPeriod] = useState<"this" | "next" | "custom">("this");
  const [range, setRange] = useState(() => monthRange(0));
  const [laws, setLaws] = useState<string[]>([...LAWS]);
  const [channels, setChannels] = useState<("Email" | "WhatsApp")[]>(["Email"]);
  const [data, setData] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [showClients, setShowClients] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function choosePeriod(p: "this" | "next" | "custom") {
    setPeriod(p);
    if (p !== "custom") setRange(monthRange(p === "this" ? 0 : 1));
  }

  const query = useMemo(
    () => `from=${range.from}&to=${range.to}&laws=${encodeURIComponent(laws.join(","))}`,
    [range, laws],
  );

  useEffect(() => {
    if (!range.from || !range.to) return;
    let cancelled = false;
    setResult(null);
    fetch(`/api/reminders/statutory?${query}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not build the circular"))))
      .then((d: Preview) => {
        if (cancelled) return;
        setData(d);
        // Default to everyone who can be reached; a manual deselection is
        // kept only while the period is unchanged.
        setPicked(d.clients.filter((c) => c.reachable).map((c) => c.id));
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "Could not build the circular"));
    return () => {
      cancelled = true;
    };
  }, [query, range.from, range.to]);

  const toggleLaw = (l: string) =>
    setLaws((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]));
  const toggleChannel = (c: "Email" | "WhatsApp") =>
    setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const togglePick = (id: string) =>
    setPicked((p) => (p ?? []).includes(id) ? (p ?? []).filter((x) => x !== id) : [...(p ?? []), id]);

  // How many messages will actually go out: a client counts once per channel
  // they can be reached on.
  const willSend = (data?.clients ?? [])
    .filter((c) => (picked ?? []).includes(c.id))
    .reduce((n, c) => n + channels.filter((ch) => (ch === "Email" ? c.email : c.phone)).length, 0);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reminders/statutory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: range.from, to: range.to, laws, clientIds: picked, channels }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Could not send the circular");
      }
      setResult((await res.json()) as Result);
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the circular");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Statutory due-date circular"
        subtitle="Write to every client with the Income Tax, GST and MCA dates falling in a period"
      />
      <div className="space-y-4 p-4">
        {err && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">{err}</div>
        )}
        {result && (
          <div
            data-testid="bulletin-result"
            className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200"
          >
            {result.period}: {result.sent > 0 && <>{result.sent} sent. </>}
            {result.simulated > 0 && (
              <>
                {result.simulated} recorded but not delivered — no email/WhatsApp credentials are
                configured yet.{" "}
              </>
            )}
            {result.failed > 0 && <strong>{result.failed} failed. </strong>}
            {result.skipped > 0 && <>{result.skipped} already had this period&apos;s circular.</>}
          </div>
        )}

        {/* Period */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <CalendarClock className="h-3.5 w-3.5" /> Period
          </span>
          {(
            [
              ["this", "This month"],
              ["next", "Next month"],
              ["custom", "Custom"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => choosePeriod(k)}
              data-testid={`bulletin-period-${k}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                period === k
                  ? "bg-slate-800 text-white ring-slate-800"
                  : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
          {period === "custom" && (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
              to
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </span>
          )}
        </div>

        {/* Laws & channels */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Scale className="h-3.5 w-3.5" /> Laws
          </span>
          {LAWS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => toggleLaw(l)}
              aria-pressed={laws.includes(l)}
              data-testid={`bulletin-law-${l}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                laws.includes(l)
                  ? "bg-brand-600 text-white ring-brand-600"
                  : "bg-white text-slate-500 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {l === "MCA" ? "MCA / ROC" : l}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {(["Email", "WhatsApp"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleChannel(c)}
              aria-pressed={channels.includes(c)}
              data-testid={`bulletin-channel-${c}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                channels.includes(c)
                  ? "bg-slate-800 text-white ring-slate-800"
                  : "bg-white text-slate-500 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {c === "Email" ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
              {c}
            </button>
          ))}
        </div>

        {/* What is in it */}
        {!data ? (
          <p className="py-4 text-sm text-slate-500">Building the circular…</p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-sm font-medium text-slate-700" data-testid="bulletin-summary">
                {data.entries.length} statutory due date(s) in {data.period}
                {data.entries.length > 0 && (
                  <span className="font-normal text-slate-500">
                    {" "}
                    · {formatDate(data.entries[0].dueDate)} to{" "}
                    {formatDate(data.entries[data.entries.length - 1].dueDate)}
                  </span>
                )}
              </p>
              {data.entries.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  Nothing falls due in this period under the laws selected.
                </p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {data.entries.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-16 shrink-0 tabular-nums text-slate-400">
                        {formatDate(e.dueDate)}
                      </span>
                      <span className="min-w-0">
                        {e.title} <span className="text-slate-400">· {e.law}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recipients */}
            <div>
              <button
                type="button"
                onClick={() => setShowClients((s) => !s)}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"
                data-testid="bulletin-recipients-toggle"
              >
                <Users className="h-4 w-4 text-slate-400" />
                <span className="font-medium" data-testid="bulletin-recipients">
                  {willSend} message(s) to {(picked ?? []).length} client(s)
                </span>
                <span className="text-xs text-slate-400">
                  {data.reachable.email} with email · {data.reachable.whatsapp} with phone
                </span>
                <ChevronDown
                  className={cn("ml-auto h-4 w-4 text-slate-400 transition-transform", showClients && "rotate-180")}
                />
              </button>
              {showClients && (
                <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {data.clients.map((c) => (
                    <li key={c.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50",
                          !c.reachable && "opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={(picked ?? []).includes(c.id)}
                          onChange={() => togglePick(c.id)}
                          disabled={!c.reachable}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="flex-1 text-slate-700">{c.name}</span>
                        <span className="text-xs text-slate-400">
                          {c.reachable ? (c.email ?? c.phone) : "No email or phone"}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Exactly what a client reads */}
            {data.preview && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowMessage((s) => !s)}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  data-testid="bulletin-preview-toggle"
                >
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">Preview the message</span>
                  <ChevronDown
                    className={cn("ml-auto h-4 w-4 text-slate-400 transition-transform", showMessage && "rotate-180")}
                  />
                </button>
                {showMessage && (
                  <div
                    className="mt-1 rounded-lg border border-slate-200 bg-white p-3"
                    data-testid="bulletin-preview"
                  >
                    <p className="mb-2 text-xs font-medium text-slate-700">{data.preview.subject}</p>
                    <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap text-slate-600">
                      {data.preview.body}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {canManage && (
              <div className="flex justify-end">
                <Button
                  onClick={send}
                  disabled={busy || willSend === 0 || data.entries.length === 0}
                  data-testid="bulletin-send"
                >
                  <Send className="h-4 w-4" />
                  {busy ? "Sending…" : `Send to ${(picked ?? []).length} client(s)`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
