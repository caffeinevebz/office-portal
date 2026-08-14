import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { mailSendSchema } from "@/lib/validation";
import { sendMail } from "@/lib/mail/send";
import type { Prisma } from "@prisma/client";

/**
 * The firm's mailbox. Bodies and attachment bytes are left out of the list —
 * a page of mail should not carry a page of megabytes; the reading pane
 * fetches the one message being read.
 */
export const GET = route(async (req) => {
  await requirePermission("viewMail");
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const clientId = searchParams.get("clientId")?.trim();
  const view = searchParams.get("view")?.trim(); // All (default), Unread, Unfiled, Sent
  const take = Math.min(Number(searchParams.get("take")) || 100, 200);

  const where: Prisma.MailMessageWhereInput = {};
  const and: Prisma.MailMessageWhereInput[] = [];
  if (view === "Sent") where.direction = "Sent";
  else if (view === "Unread") and.push({ direction: "Incoming", readAt: null });
  // Mail nobody has filed yet — the pile that needs a person to look at it.
  else if (view === "Unfiled") and.push({ direction: "Incoming", clientId: null });
  if (clientId && clientId !== "All")
    where.clientId = clientId === "None" ? null : clientId;
  if (q) {
    and.push({
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { fromName: { contains: q, mode: "insensitive" } },
        { fromEmail: { contains: q, mode: "insensitive" } },
        { snippet: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const rows = await prisma.mailMessage.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take,
    select: {
      id: true,
      subject: true,
      fromName: true,
      fromEmail: true,
      toEmails: true,
      sentAt: true,
      snippet: true,
      direction: true,
      readAt: true,
      matchedBy: true,
      client: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
      _count: { select: { attachments: true } },
    },
  });
  return ok(
    rows.map(({ _count, ...m }) => ({ ...m, attachmentCount: _count.attachments })),
  );
});

/** Write a message, or answer one. */
export const POST = route(async (req) => {
  await requirePermission("manageMail");
  const { clientId, ...out } = await parse(req, mailSendSchema);
  const result = await sendMail(out, clientId ?? null);
  // A refused message is still recorded, so it is never silently lost — the
  // caller is told plainly rather than shown a success it did not get.
  return ok(result, result.status === "Failed" ? 502 : 201);
});
