import { prisma } from "@/lib/prisma";
import { fail, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { buildQueryLetterPdf, queryLetterFilename } from "@/lib/pdf/query-letter";
import { pdfResponse } from "@/lib/pdf/document";

type Ctx = { params: Promise<{ id: string }> };

/** The letter as it goes to the client, on the firm's letterhead. */
export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const letter = await prisma.queryLetter.findUnique({
    where: { id },
    include: {
      client: true,
      organization: true,
      task: true,
      // The internal note is deliberately not selected: a working paper must
      // not be able to reach a client-facing document by accident.
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
        },
      },
    },
  });
  if (!letter) return fail("Query letter not found", 404);

  const bytes = await buildQueryLetterPdf({
    number: letter.number,
    subject: letter.subject,
    preamble: letter.preamble,
    issuedAt: letter.issuedAt,
    replyBy: letter.replyBy,
    client: {
      name: letter.client.name,
      address: letter.client.address,
      contactPerson: letter.client.contactPerson,
    },
    task: letter.task
      ? { title: letter.task.title, financialYear: letter.task.financialYear }
      : null,
    organization: letter.organization,
    items: letter.items,
  });

  return pdfResponse({
    bytes,
    filename: queryLetterFilename(letter.number),
    title: `Query letter ${letter.number}`,
  });
});
