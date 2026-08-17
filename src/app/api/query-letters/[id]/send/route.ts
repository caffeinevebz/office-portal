import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { buildQueryLetterPdf, queryLetterFilename } from "@/lib/pdf/query-letter";
import { letterBody } from "@/lib/audit-notes";
import { deliver, getEmailConfig } from "@/lib/notify";
import { toLetterhead } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

// Reading the mailbox, rendering a PDF and handing it to a mail server is
// slower than a database write, so ask for room rather than be cut off with
// the letter half sent.
export const maxDuration = 60;

/** Email the letter to the client, with the PDF attached. */
export const POST = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;

  const letter = await prisma.queryLetter.findUnique({
    where: { id },
    include: {
      client: true,
      organization: true,
      task: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          kind: true,
          observation: true,
          ledgerName: true,
          voucherNo: true,
          voucherDate: true,
          partyName: true,
          amount: true,
          documentsRequired: true,
        },
      },
    },
  });
  if (!letter) return fail("Query letter not found", 404);
  if (letter.items.length === 0) return fail("This letter has no points on it");

  const to = letter.client.email?.trim();
  if (!to) return fail("This client has no email address on record");

  const lh = toLetterhead(letter.organization);
  const pdf = await buildQueryLetterPdf({
    number: letter.number,
    subject: letter.subject,
    preamble: letter.preamble,
    issuedAt: letter.issuedAt,
    replyBy: letter.replyBy,
    revision: letter.revision,
    revisedAt: letter.revisedAt,
    client: {
      name: letter.client.name,
      address: letter.client.address,
      contactPerson: letter.client.contactPerson,
    },
    task: letter.task ? { title: letter.task.title, financialYear: letter.task.financialYear } : null,
    organization: letter.organization,
    items: letter.items,
  });

  const subject =
    letter.subject?.trim() || `Audit queries — ${letter.number}${letter.task ? ` (${letter.task.title})` : ""}`;
  // The same words as the attachment, so the client reading the message and
  // the client reading the letter are reading one thing.
  const body = letterBody(
    letter,
    letter.client.contactPerson || letter.client.name,
    letter.items,
    lh.name,
  );

  const status = await deliver("Email", to, subject, body, [
    { filename: queryLetterFilename(letter.number), content: pdf },
  ]);
  if (status === "Failed") return fail("The email provider rejected the message", 502);

  const [updated] = await Promise.all([
    prisma.queryLetter.update({
      where: { id },
      data: { status: "Sent", sentAt: new Date(), sentTo: to },
      select: { id: true, number: true, status: true, sentAt: true, sentTo: true },
    }),
    // Anything still merely open on this letter has now actually been asked.
    prisma.auditObservation.updateMany({
      where: { letterId: id, status: "Open" },
      data: { status: "Queried" },
    }),
    prisma.notificationLog.create({
      data: {
        channel: "Email",
        recipientType: "Client",
        recipientName: letter.client.name,
        to,
        subject,
        body,
        status,
        dedupeKey: `query-letter:${letter.id}:${Date.now()}`,
      },
    }),
  ]);

  const cfg = await getEmailConfig();
  return ok({ status, to, live: cfg.live, letter: updated });
});
