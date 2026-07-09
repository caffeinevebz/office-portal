import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { scheduleCreateSchema } from "@/lib/validation";

export const GET = route(async () => {
  await requireUser();
  const schedules = await prisma.complianceSchedule.findMany({
    orderBy: [{ active: "desc" }, { title: "asc" }],
    include: {
      client: true,
      assignee: true,
      _count: { select: { tasks: true } },
    },
  });
  return ok(schedules);
});

export const POST = route(async (req) => {
  await requirePermission("manageSchedules");
  const data = await parse(req, scheduleCreateSchema);
  const schedule = await prisma.complianceSchedule.create({
    data,
    include: { client: true, assignee: true, _count: { select: { tasks: true } } },
  });
  return ok(schedule, 201);
});
