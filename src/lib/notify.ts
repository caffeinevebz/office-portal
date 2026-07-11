import "server-only";
import { prisma } from "@/lib/prisma";
import { getDefaultOrg } from "@/lib/org";

// Delivery layer for all outbound mail & WhatsApp: reminders, invoices,
// invitations, password resets and alerts. Email uses the firm's official
// mailbox configured in Settings → Email (stored in the database); the
// RESEND_API_KEY / REMINDER_FROM_EMAIL env vars act as fallbacks. Without
// either, messages are "simulated" (rendered and logged only).

export type DeliveryStatus = "Sent" | "Simulated" | "Failed";

export type EmailAttachment = { filename: string; content: Buffer | Uint8Array };

const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export type EmailConfig = {
  apiKey: string | null;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  configuredInApp: boolean; // true when the key comes from Settings → Email
};

/** Effective outbound-email configuration: DB settings first, env fallback. */
export async function getEmailConfig(): Promise<EmailConfig> {
  const [row, org] = await Promise.all([
    prisma.emailSettings.findUnique({ where: { id: "default" } }).catch(() => null),
    getDefaultOrg().catch(() => null),
  ]);
  const apiKey = row?.resendApiKey?.trim() || process.env.RESEND_API_KEY || null;
  const fromEmail =
    row?.fromEmail?.trim() ||
    process.env.REMINDER_FROM_EMAIL ||
    org?.email?.trim() ||
    "onboarding@resend.dev";
  return {
    apiKey,
    fromEmail,
    fromName: row?.fromName?.trim() || org?.name?.trim() || null,
    replyTo: row?.replyTo?.trim() || null,
    configuredInApp: Boolean(row?.resendApiKey?.trim()),
  };
}

export async function providerStatus() {
  const email = await getEmailConfig();
  return {
    email: email.apiKey
      ? `Resend (live) — from ${email.fromEmail}`
      : "Simulated",
    whatsapp: WA_TOKEN && WA_PHONE_ID ? "Meta Cloud API (live)" : "Simulated",
    live: Boolean(email.apiKey || (WA_TOKEN && WA_PHONE_ID)),
  };
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[],
): Promise<DeliveryStatus> {
  const cfg = await getEmailConfig();
  if (!cfg.apiKey) return "Simulated";
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

async function sendWhatsapp(to: string, body: string): Promise<DeliveryStatus> {
  if (!WA_TOKEN || !WA_PHONE_ID) return "Simulated";
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/[^\d+]/g, ""),
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
