import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { queryLetterCreateSchema } from "@/lib/validation";
import { selectForLetter } from "@/lib/audit-notes";
import { nextQueryLetterNumber } from "@/lib/numbering";
import { getDefaultOrg } from "@/lib/org";

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

/** Letters issued, newest first; narrowed to a client or an engagement. */
export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId")?.trim();
  const taskId = searchParams.get("taskId")?.trim();
  const letters = await prisma.queryLetter.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      ...(taskId ? { taskId } : {}),
    },
    orderBy: { issuedAt: "desc" },
    select: LETTER_SELECT,
  });
  return ok(letters);
});

/**
 * Raise a letter from the chosen points.
 *
 * Points that cannot be asked are refused rather than quietly dropped — a
 * letter that silently left one out would send the auditor looking for an
 * answer that was never requested. Nothing is created unless at least one
 * point can go on it.
 */
export const POST = route(async (req) => {
  await requirePermission("manageTasks");
  const { observationIds, taskId, organizationId, ...data } = await parse(
    req,
    queryLetterCreateSchema,
  );

  const { eligible, ineligible, clientId } = await selectForLetter(observationIds);
  if (eligible.length === 0) {
    return fail(
      ineligible.length > 0
        ? `Nothing to ask: ${ineligible.map((i) => i.reason).join("; ")}.`
        : "Those points could not be found.",
      409,
    );
  }
  if (!clientId) {
    return fail(
      "The chosen points belong to different clients (or to none). A letter goes to one client.",
      400,
    );
  }

  const org = organizationId
    ? await prisma.organization.findUnique({ where: { id: organizationId } })
    : await getDefaultOrg();

  const letter = await prisma.queryLetter.create({
    data: {
      number: await nextQueryLetterNumber(org, new Date()),
      subject: data.subject,
      preamble: data.preamble,
      replyBy: data.replyBy,
      clientId,
      taskId: taskId ?? null,
      organizationId: org?.id ?? null,
      // The points go on the letter and are marked as asked in one step, so
      // there is never a letter whose points still read as unasked.
      items: { connect: eligible.map((e) => ({ id: e.id })) },
    },
    select: LETTER_SELECT,
  });
  await prisma.auditObservation.updateMany({
    where: { id: { in: eligible.map((e) => e.id) } },
    data: { status: "Queried" },
  });

  return ok({ letter, ineligible }, 201);
});
