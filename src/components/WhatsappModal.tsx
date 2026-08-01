"use client";

import { useEffect, useState } from "react";
import { MessageCircle, ExternalLink, FileText, Send, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { waLink } from "@/lib/format";

/** A PDF to send along with the message — an invoice or its receipt. */
export type WhatsappDocument = {
  invoiceId: string;
  kind: "invoice" | "receipt";
  /** Authenticated URL the PDF is fetched from, for the OS share sheet. */
  src: string;
};

type Props = {
  /** Who the message goes to — prefilled, still editable. */
  to: string | null | undefined;
  recipientName?: string | null;
  recipientType?: "Client" | "Staff" | "Other";
  /** Starting text of the message. */
  message: string;
  title?: string;
  /** When set, the invoice/receipt PDF travels with the message. */
  document?: WhatsappDocument;
  onClose: () => void;
};

type SendResult = { status: string; to: string; live: boolean; link: string | null };
type DocInfo = { title: string; filename: string; shareUrl: string };

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
  document: doc,
  onClose,
}: Props) {
  const [number, setNumber] = useState(to ?? "");
  const [body, setBody] = useState(message);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [info, setInfo] = useState<DocInfo | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  useEffect(() => {
    // Tell the user up front whether this sends from the firm's number.
    fetch("/api/whatsapp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLive(d ? Boolean(d.live) : null))
      .catch(() => setLive(null));
  }, []);

  // The share link has to exist *before* the hand-off link is clicked — the
  // WhatsApp anchor is a real navigation, so nothing can be awaited on click.
  useEffect(() => {
    if (!doc) return;
    fetch(`/api/invoices/${doc.invoiceId}/whatsapp?kind=${doc.kind}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInfo(d as DocInfo))
      .catch(() => setInfo(null));
  }, [doc]);

  // What actually goes out on the hand-off path: the message plus a link to
  // the PDF, because WhatsApp cannot be handed a file from a web page.
  const handoffBody = info && !body.includes("/api/share/")
    ? `${body}\n\n${info.title}: ${info.shareUrl}`
    : body;

  // Send from the firm's WhatsApp number (only when credentials exist).
  async function send() {
    if (!number.trim() || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const url = doc ? `/api/invoices/${doc.invoiceId}/whatsapp` : "/api/whatsapp";
      const payload = doc
        ? { kind: doc.kind, to: number, body, recipientName }
        : { to: number, body, recipientName, recipientType };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  // On a phone, the surest way to put the actual PDF into a WhatsApp chat is
  // the OS share sheet — pick WhatsApp, pick the contact, done.
  async function sharePdf() {
    if (!doc) return;
    try {
      const res = await fetch(doc.src, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not prepare the PDF");
      const blob = await res.blob();
      const file = new File([blob], info?.filename ?? "document.pdf", { type: "application/pdf" });
      if (typeof navigator.canShare !== "function" || !navigator.canShare({ files: [file] })) {
        throw new Error("This device cannot share files from the browser");
      }
      await navigator.share({ files: [file], title: info?.title ?? title, text: body });
      setShared("The PDF was handed to WhatsApp.");
      logHandoff();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setShared(e instanceof Error ? e.message : "Could not share the PDF");
    }
  }

  const canSharePdf =
    !!doc && typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  // Sending a document before its link has been minted would deliver a
  // message with nothing attached, so the hand-off waits for it.
  const ready = !!number.trim() && !!body.trim() && (!doc || !!info);

  // Hand-off path: the button is a real link, so the browser opens WhatsApp
  // as a normal navigation (a scripted window.open after an await would be
  // blocked as an unsolicited pop-up). The send is logged in the background.
  const handoffHref = waLink(number, handoffBody);
  function logHandoff() {
    const url = doc ? `/api/invoices/${doc.invoiceId}/whatsapp` : "/api/whatsapp";
    const payload = doc
      ? { kind: doc.kind, to: number, body: handoffBody, recipientName }
      : { to: number, body, recipientName, recipientType };
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
          {canSharePdf && !live && (
            <Button variant="secondary" onClick={sharePdf} disabled={busy}>
              <Share2 className="h-4 w-4" /> Share the PDF
            </Button>
          )}
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
              data-testid="wa-handoff"
              onClick={(e) => {
                if (!ready) {
                  e.preventDefault();
                  return;
                }
                logHandoff();
              }}
              className={
                "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 " +
                (!ready ? "pointer-events-none opacity-50" : "")
              }
            >
              <Send className="h-4 w-4" />
              {!doc
                ? "Open in WhatsApp"
                : info
                  ? "Open WhatsApp with the link"
                  : "Preparing the link…"}
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
      {shared && (
        <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
          {shared}
        </div>
      )}
      {result && (
        <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
          {result.live ? (
            <>
              Sent from the firm&apos;s WhatsApp number to {result.to}
              {doc ? ", with the PDF attached." : "."}
            </>
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
        {doc && (
          <div
            data-testid="wa-attachment"
            className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2.5"
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0 text-xs">
              <p className="font-medium text-brand-800">{info?.title ?? "Preparing the PDF…"}</p>
              <p className="mt-0.5 text-slate-600">
                {live
                  ? "The PDF goes out as an attachment from the firm's WhatsApp number."
                  : "WhatsApp can't be handed a file from a web page, so the message carries a secure link the client can tap to open the PDF — valid for 30 days." +
                    (canSharePdf ? " On this device you can also share the PDF file itself." : "")}
              </p>
            </div>
          </div>
        )}
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
