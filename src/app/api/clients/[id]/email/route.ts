import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { deliver, getEmailConfig } from "@/lib/notify";
import { getDefaultOrg } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Message is required").max(10000),
});

// Send an ad-hoc email (document requests, updates…) to a client from the
// firm's official mailbox, with a copy kept in the notification log.
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("manageClients");
  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return fail("Client not found", 404);
  const to = client.email?.trim();
  if (!to) return fail("This client has no email address on record");

  const { subject, body } = await parse(req, schema);
  const org = await getDefaultOrg();
  const signed = `${body}\n\nWarm regards,\n${user.name}\n${org?.name ?? ""}`.trim();

  const status = await deliver("Email", to, subject, signed);
  if (status === "Failed") return fail("The email provider rejected the message", 502);

  await prisma.notificationLog.create({
    data: {
      channel: "Email",
      recipientType: "Client",
      recipientName: client.name,
      to,
      subject,
      body: signed,
      status,
      dedupeKey: `client-email:${client.id}:${Date.now()}`,
    },
  });
  const cfg = await getEmailConfig();
  return ok({ status, to, live: cfg.live });
});
