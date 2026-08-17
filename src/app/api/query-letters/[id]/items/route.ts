import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { queryLetterItemsSchema } from "@/lib/validation";
import { selectForLetter } from "@/lib/audit-notes";

type Ctx = { params: Promise<{ id: string }> };

const LETTER_SELECT = {
  id: true,
  number: true,
  status: true,
  revision: true,
  revisedAt: true,
  issuedAt: true,
  sentAt: true,
  items: { select: { id: true } },
} as const;

/**
 * Add points to a letter that already exists.
 *
 * More points nearly always turn up after the first letter goes — a second
 * reference for the same audit means the client is answering two documents and
 * the firm is chasing two. So a point can join the letter it belongs on.
 *
 * A letter still in **draft** simply takes them. One that has **gone** is
 * re-issued: the revision number steps up, the date it was revised is stamped,
 * and it drops back to Draft so somebody has to send it again — the client's
 * copy is out of date the moment a point is added, and a letter the firm
 * quietly changed underneath the client is worse than a second letter.
 */
export const POST = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const { observationIds } = await parse(req, queryLetterItemsSchema);

  const letter = await prisma.queryLetter.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, clientId: true, revision: true },
  });
  if (!letter) return fail("Query letter not found", 404);
  if (letter.status === "Closed") {
    return fail(
      `Letter ${letter.number} has been closed. Raise a new letter for anything further.`,
      409,
    );
  }

  const { eligible, ineligible, clientId } = await selectForLetter(observationIds);
  if (eligible.length === 0) {
    return fail(
      ineligible.length > 0
        ? `Nothing to add: ${ineligible.map((i) => i.reason).join("; ")}.`
        : "Those points could not be found.",
      409,
    );
  }
  // A letter goes to one client; a point from another's file cannot join it.
  if (clientId && clientId !== letter.clientId) {
    return fail(
      `Those points belong to another client's file, so they cannot go on letter ${letter.number}.`,
      400,
    );
  }

  const issued = letter.status !== "Draft";
  const [updated] = await Promise.all([
    prisma.queryLetter.update({
      where: { id },
      data: {
        items: { connect: eligible.map((e) => ({ id: e.id })) },
        ...(issued
          ? { revision: letter.revision + 1, revisedAt: new Date(), status: "Draft" }
          : {}),
      },
      select: LETTER_SELECT,
    }),
    prisma.auditObservation.updateMany({
      where: { id: { in: eligible.map((e) => e.id) } },
      data: { status: "Queried" },
    }),
  ]);

  return ok({
    letter: updated,
    added: eligible.length,
    ineligible,
    // What the firm now has to do about it, said plainly.
    reissued: issued,
    message: issued
      ? `${eligible.length} point${eligible.length === 1 ? "" : "s"} added. Letter ${letter.number} had already gone, so it is now revision ${letter.revision + 1} and back in draft — send it again so the client has the whole list.`
      : `${eligible.length} point${eligible.length === 1 ? "" : "s"} added to draft letter ${letter.number}.`,
  });
});

/**
 * Take a point back off a letter that has not gone yet.
 *
 * Only a draft can lose a point. Once a letter has been sent, what was asked
 * is a matter of record — the point is marked Dropped instead, which says the
 * firm stopped pursuing it rather than pretending it never asked.
 */
export const DELETE = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const observationId = new URL(req.url).searchParams.get("observationId")?.trim();
  if (!observationId) return fail("Which point should come off the letter?");

  const letter = await prisma.queryLetter.findUnique({
    where: { id },
    select: { number: true, status: true, revision: true },
  });
  if (!letter) return fail("Query letter not found", 404);
  if (letter.status !== "Draft" && letter.revision === 1) {
    return fail(
      `Letter ${letter.number} has gone to the client. Mark the point Dropped rather than taking it off, so the record of what was asked stays intact.`,
      409,
    );
  }

  const point = await prisma.auditObservation.findFirst({
    where: { id: observationId, letterId: id },
    select: { id: true },
  });
  if (!point) return fail("That point is not on this letter", 404);

  await prisma.auditObservation.update({
    where: { id: observationId },
    data: { letterId: null, status: "Open" },
  });
  return ok({ ok: true, removed: observationId });
});
