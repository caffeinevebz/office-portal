"use client";

import { useEffect, useState } from "react";
import { MessageCircle, ExternalLink, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { waLink } from "@/lib/format";

type Props = {
  /** Who the message goes to — prefilled, still editable. */
  to: string | null | undefined;
  recipientName?: string | null;
  recipientType?: "Client" | "Staff" | "Other";
  /** Starting text of the message. */
  message: string;
  title?: string;
  onClose: () => void;
};

type SendResult = { status: string; to: string; live: boolean; link: string | null };

/**
 * Compose and send a WhatsApp message. When the firm has WhatsApp Cloud API
 * credentials in Firm Settings the message is sent from the firm's number;
 * otherwise the app hands off to the sender's own WhatsApp with the text
 * ready to go. Either way the message is recorded in the delivery log.
 */
export function WhatsappModal({
  to,
  recipientName,
  recipientType = "Client",
  message,
  title = "Send on WhatsApp",
  onClose,
}: Props) {
  const [number, setNumber] = useState(to ?? "");
  const [body, setBody] = useState(message);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    // Tell the user up front whether this sends from the firm's number.
    fetch("/api/whatsapp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLive(d ? Boolean(d.live) : null))
      .catch(() => setLive(null));
  }, []);

  // Send from the firm's WhatsApp number (only when credentials exist).
  async function send() {
    if (!number.trim() || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: number, body, recipientName, recipientType }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Could not send the message");
      }
      setResult((await res.json()) as SendResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the message");
    } finally {
      setBusy(false);
    }
  }

  // Hand-off path: the button is a real link, so the browser opens WhatsApp
  // as a normal navigation (a scripted window.open after an await would be
  // blocked as an unsolicited pop-up). The send is logged in the background.
  const handoffHref = waLink(number, body);
  function logHandoff() {
    fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: number, body, recipientName, recipientType }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setResult(d as SendResult))
      .catch(() => {
        // The chat still opened; only the log entry is missing.
      });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={
        recipientName ? `To ${recipientName}` : "Type the message and send it on WhatsApp"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {result ? "Close" : "Cancel"}
          </Button>
          {live ? (
            <Button onClick={send} disabled={busy || !number.trim() || !body.trim()}>
              {busy ? "Sending…" : (
                <>
                  <Send className="h-4 w-4" /> Send
                </>
              )}
            </Button>
          ) : (
            <a
              href={handoffHref}
              target="_blank"
              rel="noopener"
              onClick={(e) => {
                if (!number.trim() || !body.trim()) {
                  e.preventDefault();
                  return;
                }
                logHandoff();
              }}
              className={
                "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 " +
                (!number.trim() || !body.trim() ? "pointer-events-none opacity-50" : "")
              }
            >
              <Send className="h-4 w-4" /> Open in WhatsApp
            </a>
          )}
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      {result && (
        <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
          {result.live ? (
            <>Sent from the firm&apos;s WhatsApp number to {result.to}.</>
          ) : (
            <>
              WhatsApp opened in a new tab with the message ready to send.{" "}
              {result.link && (
                <a
                  href={result.link}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 font-medium underline"
                >
                  Open again <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </>
          )}
        </div>
      )}
      <div className="space-y-4">
        <Field label="WhatsApp number" required hint="With or without the country code (91 assumed for 10-digit numbers)">
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="+91 98290 00000"
          />
        </Field>
        <Field label="Message" required>
          <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {live === false && (
          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            The firm has no WhatsApp Business API configured, so this opens the
            chat in your own WhatsApp with the message filled in. Add the
            credentials in Firm Settings to send straight from the firm&apos;s number.
          </p>
        )}
      </div>
    </Modal>
  );
}
