"use client";

import { useEffect, useState } from "react";
import { BellRing, Mail, MessageCircle, ShieldAlert, ShieldX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDate, cn } from "@/lib/format";

type Item = {
  id: string;
  holderName: string;
  class: string;
  clientName: string | null;
  expiryDate: string;
  expired: boolean;
  email: string | null;
  phone: string | null;
  reachable: boolean;
};

type Result = {
  total: number;
  sent: number;
  simulated: number;
  failed: number;
  recipients: { name: string; to: string }[];
};

/**
 * Ask the clients whose certificates have expired — or expire within the next
 * month — to renew them, now rather than at the next nightly run. Every
 * holder is listed with the address they will be written at, so nothing goes
 * out unseen.
 */
export function DscReminderModal({ days = 30, onClose }: { days?: number; onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [channels, setChannels] = useState<("Email" | "WhatsApp")[]>(["Email"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch(`/api/dsc/remind?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load the certificates"))))
      .then((d: { items: Item[] }) => {
        setItems(d.items);
        // Everyone who can actually be written to starts selected.
        setPicked(d.items.filter((i) => i.reachable).map((i) => i.id));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the certificates"));
  }, [days]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleChannel = (c: "Email" | "WhatsApp") =>
    setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  // A holder with no email cannot be emailed; warn rather than fail silently.
  const unreachable = (items ?? []).filter(
    (i) =>
      picked.includes(i.id) &&
      !channels.some((c) => (c === "Email" ? i.email : i.phone)),
  );

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/dsc/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dscIds: picked, channels, days }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Could not send the reminders");
      }
      setResult((await res.json()) as Result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the reminders");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Send DSC renewal reminders"
      description={`Certificates that have expired, or expire within ${days} days`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={send}
              disabled={busy || picked.length === 0 || channels.length === 0}
              data-testid="dsc-remind-send"
            >
              <BellRing className="h-4 w-4" />
              {busy
                ? "Sending…"
                : `Send to ${picked.length} holder${picked.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}

      {result ? (
        <div data-testid="dsc-remind-result" className="space-y-3">
          <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
            {result.sent > 0 && <>Sent {result.sent} reminder(s). </>}
            {result.simulated > 0 && (
              <>
                {result.simulated} reminder(s) were recorded but not delivered — the firm has no
                email/WhatsApp credentials configured yet.{" "}
              </>
            )}
            {result.failed > 0 && <strong>{result.failed} failed. </strong>}
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs text-slate-600">
            {result.recipients.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded px-1 py-1">
                <span className="font-medium text-slate-700">{r.name}</span>
                <span className="text-slate-500">{r.to}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Send by</span>
            {(["Email", "WhatsApp"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleChannel(c)}
                aria-pressed={channels.includes(c)}
                data-testid={`dsc-channel-${c}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                  channels.includes(c)
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-slate-500 ring-slate-300 hover:bg-slate-50",
                )}
              >
                {c === "Email" ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                {c}
              </button>
            ))}
          </div>

          {!items ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading certificates…</p>
          ) : items.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              No certificate has expired or expires within {days} days. Nothing to send.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs font-medium text-slate-500">
                  {picked.length} of {items.length} selected
                </span>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPicked(items.filter((i) => i.reachable).map((i) => i.id))}
                    className="text-brand-600 hover:underline"
                  >
                    Select all reachable
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {items.map((i) => (
                  <li key={i.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50",
                        !i.reachable && "opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(i.id)}
                        onChange={() => toggle(i.id)}
                        disabled={!i.reachable}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{i.holderName}</span>
                          <Badge tone={i.expired ? "red" : "amber"}>
                            {i.expired ? (
                              <>
                                <ShieldX className="h-3 w-3" /> Expired {formatDate(i.expiryDate)}
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="h-3 w-3" /> Expires {formatDate(i.expiryDate)}
                              </>
                            )}
                          </Badge>
                          <span className="text-xs text-slate-400">{i.class}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {i.clientName ?? "Not linked to a client"}
                          {" · "}
                          {i.reachable ? (
                            [i.email, i.phone].filter(Boolean).join("  ·  ")
                          ) : (
                            <span className="text-rose-600">
                              No email or phone on the holder or their client
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {unreachable.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  {unreachable.length} selected holder(s) have no{" "}
                  {channels.join(" or ").toLowerCase()} address — they will be skipped.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
