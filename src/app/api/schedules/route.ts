import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { scheduleCreateSchema } from "@/lib/validation";
import { generateForMonth } from "@/lib/generate";

// A short tag for the GSTIN an obligation runs for, so the obligations of a
// client with several registrations tell apart at a glance: the concern's
// trade name if the firm recorded one, else the place, else the number.
function gstTargetLabel(t: {
  tradeName?: { name: string } | null;
  reg?: { gstin: string; label?: string | null; state?: string | null } | null;
  gstin?: string | null;
}) {
  return (
    t.tradeName?.name.trim() ||
    t.reg?.label?.trim() ||
    t.reg?.state?.trim() ||
    t.reg?.gstin ||
    t.gstin ||
    ""
  );
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
  const { clientIds, allClients, gstRegistrationIds, gstTargets, ...data } = await parse(
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

  // A client with several GSTINs files each one's returns separately, so a GST
  // obligation fans out to one schedule per GSTIN — each then generating its
  // own dated tasks under that number. A client's GSTINs may be recorded as
  // GST registrations or as trade names (a proprietor's separate concerns),
  // so a target carries whichever links it has.
  const wanted =
    gstTargets && gstTargets.length > 0
      ? gstTargets
      : (gstRegistrationIds ?? []).map((id) => ({
          gstRegistrationId: id,
          tradeNameId: null,
          gstin: null,
        }));

  // Resolve the names to title by, and refuse anything not on this client.
  const [regRows, tradeRows] = await Promise.all([
    prisma.gstRegistration.findMany({
      where: {
        id: { in: wanted.map((t) => t.gstRegistrationId).filter(Boolean) as string[] },
        clientId: data.clientId ?? undefined,
      },
    }),
    prisma.tradeName.findMany({
      where: {
        id: { in: wanted.map((t) => t.tradeNameId).filter(Boolean) as string[] },
        clientId: data.clientId ?? undefined,
      },
    }),
  ]);
  const regById = new Map(regRows.map((r) => [r.id, r]));
  const tradeById = new Map(tradeRows.map((t) => [t.id, t]));

  const fanout = wanted
    .map((t) => ({
      reg: t.gstRegistrationId ? (regById.get(t.gstRegistrationId) ?? null) : null,
      tradeName: t.tradeNameId ? (tradeById.get(t.tradeNameId) ?? null) : null,
      gstin: t.gstin ?? null,
    }))
    // A target whose ids all belong to somebody else is not this client's.
    .filter((t) => t.reg || t.tradeName);

  const schedules = [];
  for (const clientId of targets) {
    const perGstin = fanout.length > 0 ? fanout : [null];
    for (const target of perGstin) {
      const label = target ? gstTargetLabel(target) : "";
      schedules.push(
        await prisma.complianceSchedule.create({
          // A Json column takes undefined to mean "leave it out", not null.
          data: {
            ...data,
            checklist: data.checklist ?? undefined,
            clientId,
            // A fan-out target wins over any single value posted alongside.
            gstRegistrationId: target ? (target.reg?.id ?? null) : (data.gstRegistrationId ?? null),
            tradeNameId: target ? (target.tradeName?.id ?? null) : (data.tradeNameId ?? null),
            // Name the obligation by its GSTIN so they tell apart at a glance
            // in the list and in every task generated from them.
            title: label ? `${data.title} · ${label}` : data.title,
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
