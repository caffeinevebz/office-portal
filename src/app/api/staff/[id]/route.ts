import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { staffUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const data = await parse(req, staffUpdateSchema);
  const member = await prisma.staff.update({ where: { id }, data });
  return ok(member);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  // Unassign this member from any tasks, then remove them.
  await prisma.task.updateMany({
    where: { assigneeId: id },
    data: { assigneeId: null },
  });
  await prisma.staff.delete({ where: { id } });
  return ok({ ok: true });
});
