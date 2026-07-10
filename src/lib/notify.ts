import "server-only";

// Delivery layer for reminders. If provider credentials are present in the
// environment, messages are actually sent; otherwise they are "simulated"
// (rendered and logged only). Both real paths use fetch — no SDK dependency.

export type DeliveryStatus = "Sent" | "Simulated" | "Failed";

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REMINDER_FROM_EMAIL || "portal@sharmaassociates.in";
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export function providerStatus() {
  return {
    email: RESEND_KEY ? "Resend (live)" : "Simulated",
    whatsapp: WA_TOKEN && WA_PHONE_ID ? "Meta Cloud API (live)" : "Simulated",
    live: Boolean(RESEND_KEY || (WA_TOKEN && WA_PHONE_ID)),
  };
}

async function sendEmail(to: string, subject: string, body: string): Promise<DeliveryStatus> {
  if (!RESEND_KEY) return "Simulated";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, text: body }),
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
): Promise<DeliveryStatus> {
  if (channel === "Email") return sendEmail(to, subject, body);
  if (channel === "WhatsApp") return sendWhatsapp(to, body);
  return "Failed";
}
