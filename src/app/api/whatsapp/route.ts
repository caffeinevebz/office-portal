import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { whatsappSendSchema, whatsappSettingsSchema } from "@/lib/validation";
import { deliver, getWhatsappConfig, waLink, waNumber } from "@/lib/notify";

// Whether the firm can send WhatsApp messages straight from the server, or
// whether the app should hand off to the sender's own WhatsApp instead.
export const GET = route(async () => {
  await requireUser();
  const cfg = await getWhatsappConfig();
  return ok({
    live: cfg.live,
    phoneNumberId: cfg.phoneNumberId,
    // The token is never echoed back — only whether one is stored.
    hasToken: Boolean(cfg.accessToken),
  });
});

// Send a WhatsApp message. With Cloud API credentials it goes out from the
// firm's WhatsApp number; without them the caller gets a wa.me link to open
// the chat from their own WhatsApp. Either way it is logged.
export const POST = route(async (req) => {
  const user = await requireUser();
  const data = await parse(req, whatsappSendSchema);
  const digits = waNumber(data.to);
  if (digits.length < 8) return fail("That does not look like a valid WhatsApp number");

  const cfg = await getWhatsappConfig();
  const status = cfg.live ? await deliver("WhatsApp", digits, "", data.body) : "Simulated";
  if (status === "Failed") {
    return fail("WhatsApp rejected the message — check the number and the firm's credentials", 502);
  }

  await prisma.notificationLog.create({
    data: {
      channel: "WhatsApp",
      recipientType: data.recipientType ?? "Client",
      recipientName: data.recipientName ?? digits,
      to: digits,
      subject: `WhatsApp from ${user.name}`,
      body: data.body,
      status,
      dedupeKey: `whatsapp:${digits}:${Date.now()}`,
    },
  });

  return ok({
    status,
    to: digits,
    live: cfg.live,
    // Present when the firm has no Cloud API set up: open this to send the
    // message from the member's own WhatsApp.
    link: cfg.live ? null : waLink(digits, data.body),
  });
});

// Save the firm's WhatsApp Cloud API credentials.
export const PUT = route(async (req) => {
  await requirePermission("manageOrgs");
  const data = await parse(req, whatsappSettingsSchema);
  await prisma.whatsappSettings.upsert({
    where: { id: "default" },
    update: { phoneNumberId: data.phoneNumberId, accessToken: data.accessToken },
    create: { id: "default", phoneNumberId: data.phoneNumberId, accessToken: data.accessToken },
  });
  const cfg = await getWhatsappConfig();
  return ok({ live: cfg.live, phoneNumberId: cfg.phoneNumberId, hasToken: Boolean(cfg.accessToken) });
});
