import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { scheduleUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageSchedules");
  const { id } = await ctx.params;
  // clientIds/allClients only make sense when creating (they fan out into
  // several schedules); an existing one belongs to exactly one client.
  const { clientIds: _c, allClients: _a, ...data } = await parse(req, scheduleUpdateSchema);
  const schedule = await prisma.complianceSchedule.update({
    where: { id },
    data: { ...data, checklist: data.checklist ?? undefined },
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
