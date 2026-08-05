import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { scheduleCreateSchema } from "@/lib/validation";
import { generateForMonth } from "@/lib/generate";

// A short tag for the registration an obligation runs for — the place if the
// firm named one, else the state, so titles stay readable.
function gstScheduleLabel(reg: { gstin: string; label?: string | null; state?: string | null }) {
  return reg.label?.trim() || reg.state?.trim() || reg.gstin;
}

const INCLUDE = {
  client: true,
  tradeName: true,
  gstRegistration: true,
  assignee: true,
  _count: { select: { tasks: true } },
} as const;

export const GET = route(async () => {
  await requireUser();
  const schedules = await prisma.complianceSchedule.findMany({
    orderBy: [{ active: "desc" }, { title: "asc" }],
    include: INCLUDE,
  });
  return ok(schedules);
});

export const POST = route(async (req) => {
  await requirePermission("manageSchedules");
  const { clientIds, allClients, gstRegistrationIds, ...data } = await parse(
    req,
    scheduleCreateSchema,
  );

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

  // A client registered in several states files each GSTIN's returns
  // separately, so a GST obligation fans out to one schedule per GSTIN —
  // each then generates its own dated tasks carrying that registration.
  const regs =
    gstRegistrationIds && gstRegistrationIds.length > 0
      ? await prisma.gstRegistration.findMany({
          where: { id: { in: gstRegistrationIds }, clientId: data.clientId ?? undefined },
        })
      : [];

  const schedules = [];
  for (const clientId of targets) {
    const perGstin = regs.length > 0 ? regs : [null];
    for (const reg of perGstin) {
      schedules.push(
        await prisma.complianceSchedule.create({
          // A Json column takes undefined to mean "leave it out", not null.
          data: {
            ...data,
            checklist: data.checklist ?? undefined,
            clientId,
            // The registration wins over any single value posted alongside.
            gstRegistrationId: reg ? reg.id : (data.gstRegistrationId ?? null),
            // Name the obligation by its registration so the two are telling
            // apart at a glance in the list and in every generated task.
            title: reg ? `${data.title} · ${gstScheduleLabel(reg)}` : data.title,
          },
          include: INCLUDE,
        }),
      );
    }
  }
  // If the new obligation already falls due this month, its task belongs in
  // the register now — waiting for next month's pass would quietly skip it.
  for (const s of schedules) await generateForMonth(new Date(), s.id).catch(() => {});

  // A single schedule still answers with an object, as before.
  return ok(schedules.length === 1 ? schedules[0] : schedules, 201);
});
