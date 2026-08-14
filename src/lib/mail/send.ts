import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailConfig, type EmailConfig } from "@/lib/notify";
import { matchClient } from "@/lib/mail/match";

// Writing mail from inside the portal.
//
// The firm's existing outbound settings do the sending — the same mailbox the
// invoices go from, so a client sees one address from the firm either way.
// What this adds over the notification sender is what a *conversation* needs:
// carbon copies, and the two headers that make a reply thread rather than
// arriving as a fresh message in the client's inbox.

export type OutgoingMail = {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  /** The message being answered, when this is a reply. */
  replyToId?: string | null;
};

export type SendResult = {
  status: "Sent" | "Simulated" | "Failed";
  mailId: string;
  error?: string;
};

/** A Message-ID of our own, so the reply can be threaded against later. */
function newMessageId(fromEmail: string): string {
  const domain = fromEmail.split("@")[1] || "ledgify.local";
  const rand = Math.random().toString(36).slice(2, 12);
  return `<${Date.now().toString(36)}.${rand}@${domain}>`;
}

/**
 * The References header for a reply: the parent's own chain plus the parent.
 * Mail clients thread on this, so getting it right is what keeps the firm's
 * answer underneath the client's question instead of beside it.
 */
function threadHeaders(parent: {
  messageId: string | null;
  references: string | null;
}): { inReplyTo: string | null; references: string | null } {
  if (!parent.messageId) return { inReplyTo: null, references: parent.references };
  const chain = [parent.references ?? "", parent.messageId].join(" ").trim().split(/\s+/);
  // Long threads are trimmed from the front; the root and the recent few are
  // what clients actually match on.
  const trimmed = chain.length > 20 ? [chain[0], ...chain.slice(-19)] : chain;
  return { inReplyTo: parent.messageId, references: trimmed.join(" ") };
}

async function deliverViaGoogle(
  cfg: EmailConfig,
  mail: OutgoingMail & { messageId: string; inReplyTo: string | null; references: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      // 465 is implicit TLS; anything else negotiates STARTTLS.
      secure: cfg.smtpPort === 465,
      auth: { user: cfg.fromEmail, pass: cfg.appPassword! },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from: cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail,
      to: mail.to.join(", "),
      ...(mail.cc?.length ? { cc: mail.cc.join(", ") } : {}),
      subject: mail.subject,
      text: mail.body,
      messageId: mail.messageId,
      ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo } : {}),
      ...(mail.references ? { references: mail.references } : {}),
      ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMTP refused the message" };
  }
}

async function deliverViaResend(
  cfg: EmailConfig,
  mail: OutgoingMail & { messageId: string; inReplyTo: string | null; references: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = { "Message-ID": mail.messageId };
    if (mail.inReplyTo) headers["In-Reply-To"] = mail.inReplyTo;
    if (mail.references) headers["References"] = mail.references;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
        to: mail.to,
        ...(mail.cc?.length ? { cc: mail.cc } : {}),
        subject: mail.subject,
        text: mail.body,
        headers,
        ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
      }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `The mail provider refused it (${res.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach the mail provider" };
  }
}

/**
 * Send a message and record it in the mailbox register.
 *
 * The copy is written whatever the outcome — including a failure, so a message
 * the firm believes it sent is never simply lost. Its status says which.
 */
export async function sendMail(out: OutgoingMail, clientIdHint?: string | null): Promise<SendResult> {
  const cfg = await getEmailConfig();
  const messageId = newMessageId(cfg.fromEmail || "ledgify.local");

  const parent = out.replyToId
    ? await prisma.mailMessage.findUnique({
        where: { id: out.replyToId },
        select: { messageId: true, references: true, clientId: true, taskId: true },
      })
    : null;
  const { inReplyTo, references } = parent
    ? threadHeaders(parent)
    : { inReplyTo: null, references: null };

  const payload = { ...out, messageId, inReplyTo, references };
  const result = !cfg.live
    ? { ok: true, simulated: true as const }
    : cfg.provider === "google"
      ? { ...(await deliverViaGoogle(cfg, payload)), simulated: false as const }
      : { ...(await deliverViaResend(cfg, payload)), simulated: false as const };

  const status = result.simulated ? "Simulated" : result.ok ? "Sent" : "Failed";
  // A reply belongs to whatever the message it answers belonged to; otherwise
  // the recipient's address decides, the same way an incoming one would.
  const clientId =
    clientIdHint ?? parent?.clientId ?? (await matchClient({ toEmails: out.to }))?.clientId ?? null;

  const saved = await prisma.mailMessage.create({
    data: {
      folder: "SENT",
      messageId,
      inReplyTo,
      references,
      subject: out.subject,
      fromName: cfg.fromName,
      fromEmail: cfg.fromEmail || null,
      toEmails: out.to,
      ccEmails: out.cc ?? [],
      sentAt: new Date(),
      textBody: out.body,
      snippet: out.body.replace(/\s+/g, " ").trim().slice(0, 240),
      direction: "Sent",
      // Your own message needs no unread state.
      seen: true,
      readAt: new Date(),
      clientId,
      matchedBy: clientId ? (clientIdHint || parent?.clientId ? "manual" : "auto") : null,
      taskId: parent?.taskId ?? null,
    },
    select: { id: true },
  });

  return {
    status,
    mailId: saved.id,
    ...("error" in result && result.error ? { error: result.error } : {}),
  };
}

/** "Re: <subject>", without stacking a second Re: on one that has it. */
export const replySubject = (subject: string | null) => {
  const s = (subject ?? "").trim() || "(no subject)";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
};

/** Who a reply goes to: the sender, with everyone else copied but us. */
export function replyRecipients(
  mail: { fromEmail: string | null; toEmails: unknown; ccEmails: unknown },
  ownAddress: string | null,
  all: boolean,
): { to: string[]; cc: string[] } {
  const own = (ownAddress ?? "").toLowerCase();
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : []);
  const to = mail.fromEmail ? [mail.fromEmail.toLowerCase()] : [];
  if (!all) return { to, cc: [] };
  const cc = [...new Set([...list(mail.toEmails), ...list(mail.ccEmails)])].filter(
    (a) => a && a !== own && !to.includes(a),
  );
  return { to, cc };
}
