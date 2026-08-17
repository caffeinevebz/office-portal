import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { queryLetterUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

const LETTER_SELECT = {
  id: true,
  number: true,
  subject: true,
  preamble: true,
  issuedAt: true,
  replyBy: true,
  status: true,
  revision: true,
  revisedAt: true,
  sentAt: true,
  sentTo: true,
  client: { select: { id: true, name: true, email: true } },
  task: { select: { id: true, title: true } },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      observation: true,
      ledgerName: true,
      voucherNo: true,
      voucherDate: true,
      partyName: true,
      amount: true,
      documentsRequired: true,
      status: true,
      response: true,
      respondedAt: true,
    },
  },
} as const;

export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const letter = await prisma.queryLetter.findUnique({ where: { id }, select: LETTER_SELECT });
  if (!letter) return fail("Query letter not found", 404);
  return ok(letter);
});

/** Amend a letter's wording or close it off. */
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const data = await parse(req, queryLetterUpdateSchema);

  const existing = await prisma.queryLetter.findUnique({
    where: { id },
    select: { status: true, number: true, revision: true },
  });
  if (!existing) return fail("Query letter not found", 404);

  // Once it has gone, its wording is what the client received. Rewriting it
  // silently would leave the firm's copy disagreeing with theirs — so a
  // reword after issue has to be asked for, and it re-issues the letter as a
  // revision that somebody must send again.
  const { revise, ...fields } = data;
  const rewording = fields.subject !== undefined || fields.preamble !== undefined;
  const issued = existing.status !== "Draft";
  if (rewording && issued && !revise) {
    return fail(
      `Letter ${existing.number} has already gone to the client. Amend it as a revision if the wording has to change — it will need sending again.`,
      409,
    );
  }

  const letter = await prisma.queryLetter.update({
    where: { id },
    data: {
      ...fields,
      ...(rewording && issued
        ? { revision: existing.revision + 1, revisedAt: new Date(), status: "Draft" }
        : {}),
    },
    select: LETTER_SELECT,
  });
  return ok(letter);
});

/**
 * Withdraw a letter that never went out. Its points go back to being open
 * questions rather than asked ones, so they can be put on another letter.
 */
export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const existing = await prisma.queryLetter.findUnique({
    where: { id },
    select: { status: true, number: true },
  });
  if (!existing) return fail("Query letter not found", 404);
  if (existing.status !== "Draft") {
    return fail(
      `Letter ${existing.number} has already gone to the client and is part of the record of what was asked.`,
      409,
    );
  }
  await prisma.auditObservation.updateMany({
    where: { letterId: id },
    data: { letterId: null, status: "Open" },
  });
  await prisma.queryLetter.delete({ where: { id } });
  return ok({ ok: true });
});
