import "server-only";
import { prisma } from "@/lib/prisma";
import { getDefaultOrg } from "@/lib/org";
// Number/link rules are shared with the client so both build the same URL.
import { waNumber, waLink } from "@/lib/format";
export { waNumber, waLink };

// Delivery layer for all outbound mail & WhatsApp: reminders, invoices,
// invitations, password resets and alerts. Email goes out from the firm's
// official mailbox configured in Firm Settings → Official firm email, via
// either Google (Workspace/Gmail SMTP with an App Password — the right
// choice when the firm's email is hosted on Google) or Resend. The
// RESEND_API_KEY / REMINDER_FROM_EMAIL env vars act as fallbacks. Without
// any credentials, messages are "simulated" (rendered and logged only).

export type DeliveryStatus = "Sent" | "Simulated" | "Failed";

export type EmailAttachment = { filename: string; content: Buffer | Uint8Array };

const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export type EmailConfig = {
  provider: "google" | "resend";
  apiKey: string | null; // resend
  appPassword: string | null; // google
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  live: boolean;
};

/** Effective outbound-email configuration: DB settings first, env fallback. */
export async function getEmailConfig(): Promise<EmailConfig> {
  const [row, org] = await Promise.all([
    prisma.emailSettings.findUnique({ where: { id: "default" } }).catch(() => null),
    getDefaultOrg().catch(() => null),
  ]);
  const provider = row?.provider === "resend" ? "resend" : "google";
  const apiKey = row?.resendApiKey?.trim() || process.env.RESEND_API_KEY || null;
  const appPassword = row?.appPassword?.trim() || null;
  const fromEmail =
    row?.fromEmail?.trim() ||
    process.env.REMINDER_FROM_EMAIL ||
    org?.email?.trim() ||
    "onboarding@resend.dev";
  return {
    provider,
    apiKey,
    appPassword,
    fromEmail,
    fromName: row?.fromName?.trim() || org?.name?.trim() || null,
    replyTo: row?.replyTo?.trim() || null,
    live: provider === "google" ? Boolean(appPassword && row?.fromEmail?.trim()) : Boolean(apiKey),
  };
}

export async function providerStatus() {
  const [email, wa] = await Promise.all([getEmailConfig(), getWhatsappConfig()]);
  return {
    email: email.live
      ? `${email.provider === "google" ? "Google SMTP" : "Resend"} (live) — from ${email.fromEmail}`
      : "Simulated",
    whatsapp: wa.live ? "Meta Cloud API (live)" : "Simulated",
    live: Boolean(email.live || wa.live),
  };
}

async function sendViaGoogle(
  cfg: EmailConfig,
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[],
): Promise<DeliveryStatus> {
  try {
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: cfg.fromEmail, pass: cfg.appPassword! },
      // Fail fast instead of hanging an API request when SMTP is unreachable.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from: cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail,
      to,
      subject,
      text: body,
      ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
      ...(attachments?.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content),
            })),
          }
        : {}),
    });
    return "Sent";
  } catch {
    return "Failed";
  }
}

async function sendViaResend(
  cfg: EmailConfig,
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[],
): Promise<DeliveryStatus> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
        to,
        subject,
        text: body,
        ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
        ...(attachments?.length
          ? {
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content).toString("base64"),
              })),
            }
          : {}),
      }),
    });
    return res.ok ? "Sent" : "Failed";
  } catch {
    return "Failed";
  }
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[],
): Promise<DeliveryStatus> {
  const cfg = await getEmailConfig();
  if (!cfg.live) return "Simulated";
  return cfg.provider === "google"
    ? sendViaGoogle(cfg, to, subject, body, attachments)
    : sendViaResend(cfg, to, subject, body, attachments);
}

export type WhatsappConfig = {
  phoneNumberId: string | null;
  accessToken: string | null;
  live: boolean;
};

/** Effective WhatsApp configuration: Firm Settings first, env fallback. */
export async function getWhatsappConfig(): Promise<WhatsappConfig> {
  const row = await prisma.whatsappSettings
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const phoneNumberId = row?.phoneNumberId?.trim() || WA_PHONE_ID || null;
  const accessToken = row?.accessToken?.trim() || WA_TOKEN || null;
  return { phoneNumberId, accessToken, live: Boolean(phoneNumberId && accessToken) };
}

async function sendWhatsapp(to: string, body: string): Promise<DeliveryStatus> {
  const cfg = await getWhatsappConfig();
  if (!cfg.live) return "Simulated";
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: waNumber(to),
          type: "text",
          text: { body },
        }),
      },
    );
    return res.ok ? "Sent" : "Failed";
  } catch {
    return "Failed";
  }
}

/**
 * Send a PDF as a real WhatsApp attachment from the firm's number. Two hops,
 * because the Cloud API will not take bytes inline: upload the file to Meta's
 * media store, then send a document message referring to the uploaded media.
 *
 * Only possible when the firm has Cloud API credentials; without them the
 * caller falls back to a wa.me hand-off carrying a share link instead.
 */
export async function sendWhatsappDocument(
  to: string,
  pdf: Uint8Array,
  filename: string,
  caption: string,
): Promise<DeliveryStatus> {
  const cfg = await getWhatsappConfig();
  if (!cfg.live) return "Simulated";
  try {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", "application/pdf");
    form.set("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
    const upload = await fetch(`https://graph.facebook.com/v20.0/${cfg.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      body: form,
    });
    if (!upload.ok) return "Failed";
    const { id } = (await upload.json()) as { id?: string };
    if (!id) return "Failed";

    const res = await fetch(`https://graph.facebook.com/v20.0/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waNumber(to),
        type: "document",
        document: { id, filename, caption },
      }),
    });
    return res.ok ? "Sent" : "Failed";
  } catch {
    return "Failed";
  }
}

export async function deliver(
  channel: string,
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[],
): Promise<DeliveryStatus> {
  if (channel === "Email") return sendEmail(to, subject, body, attachments);
  if (channel === "WhatsApp") return sendWhatsapp(to, body);
  return "Failed";
}
