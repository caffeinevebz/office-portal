import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { scheduleUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageSchedules");
  const { id } = await ctx.params;
  const data = await parse(req, scheduleUpdateSchema);
  const schedule = await prisma.complianceSchedule.update({
    where: { id },
    data,
    include: { client: true, assignee: true, _count: { select: { tasks: true } } },
  });
  return ok(schedule);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageSchedules");
  const { id } = await ctx.params;
  // Detach generated tasks (keep them), then remove the schedule.
  await prisma.task.updateMany({
    where: { scheduleId: id },
    data: { scheduleId: null },
  });
  await prisma.complianceSchedule.delete({ where: { id } });
  return ok({ ok: true });
});
