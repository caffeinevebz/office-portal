import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { observationCreateSchema } from "@/lib/validation";
import {
  OBSERVATION_SELECT,
  defaultNeedsClarification,
} from "@/lib/audit-notes";

type Ctx = { params: Promise<{ id: string }> };

/** The working paper for one engagement, oldest first — the order it was written. */
export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const rows = await prisma.auditObservation.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    select: OBSERVATION_SELECT,
  });
  return ok(rows);
});

/** Record a note against the engagement. */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const data = await parse(req, observationCreateSchema);

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, clientId: true, financialYear: true },
  });
  if (!task) return fail("Task not found", 404);

  const observation = await prisma.auditObservation.create({
    data: {
      ...data,
      // Whether the client owes an answer follows the kind unless the auditor
      // has said otherwise — a vouching point normally asks, a scrutiny note
      // normally does not.
      needsClarification: data.needsClarification ?? defaultNeedsClarification(data.kind),
      taskId: id,
      // Held on the note as well, so a client's points read across engagements.
      clientId: task.clientId,
      financialYear: data.financialYear ?? task.financialYear,
      raisedBy: user.name,
    },
    select: OBSERVATION_SELECT,
  });
  return ok(observation, 201);
});
