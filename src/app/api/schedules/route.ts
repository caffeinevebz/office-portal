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

const INCLUDE = {
  client: true,
  assignee: true,
  _count: { select: { tasks: true } },
} as const;

export const POST = route(async (req) => {
  await requirePermission("manageSchedules");
  const { clientIds, allClients, ...data } = await parse(req, scheduleCreateSchema);

  // One recurring obligation, many clients: create a schedule per client so
  // each client's tasks generate (and can be reassigned) independently.
  let targets: (string | null)[] = [data.clientId ?? null];
  if (allClients) {
    const actives = await prisma.client.findMany({
      where: { status: "Active" },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    targets = actives.map((c) => c.id);
  } else if (clientIds && clientIds.length > 0) {
    targets = [...new Set(clientIds)];
  }
  if (targets.length === 0) return ok([], 201);

  const schedules = [];
  for (const clientId of targets) {
    schedules.push(
      await prisma.complianceSchedule.create({
        data: { ...data, clientId },
        include: INCLUDE,
      }),
    );
  }
  // A single schedule still answers with an object, as before.
  return ok(schedules.length === 1 ? schedules[0] : schedules, 201);
});
