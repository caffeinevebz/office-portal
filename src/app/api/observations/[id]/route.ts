import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { observationUpdateSchema } from "@/lib/validation";
import { OBSERVATION_SELECT } from "@/lib/audit-notes";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Amend a note, or record what the client said about it.
 *
 * Recording an answer moves the point on by itself: nobody should have to
 * remember to change a dropdown after typing the reply they just received.
 */
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const data = await parse(req, observationUpdateSchema);

  const existing = await prisma.auditObservation.findUnique({
    where: { id },
    select: { status: true, response: true, letterId: true },
  });
  if (!existing) return fail("Observation not found", 404);

  const answering = !!data.response?.trim() && !existing.response?.trim();
  const observation = await prisma.auditObservation.update({
    where: { id },
    data: {
      ...data,
      ...(answering
        ? {
            respondedAt: new Date(),
            // An explicit status in the same request still wins — someone
            // recording a reply *and* closing the point means both.
            status: data.status ?? "Answered",
          }
        : {}),
      // Clearing the answer takes the point back to where it was.
      ...(data.response === null && existing.response
        ? { respondedAt: null, status: data.status ?? (existing.letterId ? "Queried" : "Open") }
        : {}),
    },
    select: OBSERVATION_SELECT,
  });

  // A letter whose points have all been answered has itself been replied to.
  if (existing.letterId) await settleLetter(existing.letterId);
  return ok(observation);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const existing = await prisma.auditObservation.findUnique({
    where: { id },
    select: { letterId: true, letter: { select: { number: true, status: true } } },
  });
  if (!existing) return fail("Observation not found", 404);
  // A point that has gone to the client is part of the record of what was
  // asked. Withdrawing it is a decision to record, not a row to remove.
  if (existing.letterId && existing.letter?.status !== "Draft") {
    return fail(
      `This point was asked on letter ${existing.letter?.number}. Mark it Dropped rather than deleting it, so the record of what was asked stays intact.`,
      409,
    );
  }
  await prisma.auditObservation.delete({ where: { id } });
  return ok({ ok: true });
});

/** Move a letter to Replied once every point on it has an answer. */
async function settleLetter(letterId: string) {
  const items = await prisma.auditObservation.findMany({
    where: { letterId },
    select: { status: true },
  });
  if (items.length === 0) return;
  const settled = items.every((i) => ["Answered", "Closed", "Dropped"].includes(i.status));
  await prisma.queryLetter.updateMany({
    where: { id: letterId, status: { in: settled ? ["Sent"] : ["Replied"] } },
    data: { status: settled ? "Replied" : "Sent" },
  });
}
