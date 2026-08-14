import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { mailFileSchema } from "@/lib/validation";
import { fileAgainstClient, backfillAlias, normaliseAddress } from "@/lib/mail/match";
import { getImapSettings } from "@/lib/mail/config";

type Ctx = { params: Promise<{ id: string }> };

const FULL = {
  id: true,
  folder: true,
  subject: true,
  fromName: true,
  fromEmail: true,
  toEmails: true,
  ccEmails: true,
  sentAt: true,
  textBody: true,
  htmlBody: true,
  snippet: true,
  truncated: true,
  direction: true,
  readAt: true,
  messageId: true,
  matchedBy: true,
  client: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  attachments: {
    select: { id: true, filename: true, contentType: true, size: true },
    orderBy: { filename: "asc" },
  },
} as const;

/** One message, with its body and the list of what came attached. */
export const GET = route(async (_req, ctx: Ctx) => {
  await requirePermission("viewMail");
  const { id } = await ctx.params;
  const mail = await prisma.mailMessage.findUnique({ where: { id }, select: FULL });
  if (!mail) return fail("Message not found", 404);
  // Opening it marks it read for the firm — one shared mailbox, one read state.
  if (!mail.readAt) {
    await prisma.mailMessage.update({ where: { id }, data: { readAt: new Date() } });
  }
  return ok(mail);
});

/**
 * File a message against a client, and/or attach it to an engagement.
 * Filing by hand teaches the register the sender's address, and pulls that
 * address's earlier mail into the client's file with it.
 */
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageMail");
  const { id } = await ctx.params;
  const { clientId, taskId } = await parse(req, mailFileSchema);

  const existing = await prisma.mailMessage.findUnique({
    where: { id },
    select: { fromEmail: true, direction: true },
  });
  if (!existing) return fail("Message not found", 404);

  if (clientId !== undefined) {
    const { config } = await getImapSettings();
    await fileAgainstClient(id, clientId ?? null, config?.user ?? null);
  }
  if (taskId !== undefined) {
    await prisma.mailMessage.update({ where: { id }, data: { taskId: taskId ?? null } });
  }

  // Everything else already sitting unfiled from that address joins the client.
  let alsoFiled = 0;
  const from = normaliseAddress(existing.fromEmail);
  if (clientId && from && existing.direction === "Incoming") {
    alsoFiled = await backfillAlias(from, clientId);
  }

  const mail = await prisma.mailMessage.findUnique({ where: { id }, select: FULL });
  return ok({ mail, alsoFiled });
});
