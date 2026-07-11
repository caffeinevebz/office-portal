import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { computeOccurrences } from "@/lib/schedule";

// Generate concrete tasks from recurring schedules. Idempotent: an occurrence
// already generated (same scheduleId + periodKey) is skipped.
export const POST = route(async (req) => {
  await requirePermission("manageSchedules");
  const body = (await req.json().catch(() => ({}))) as {
    months?: number;
    scheduleId?: string;
  };
  const months = Math.min(12, Math.max(1, Math.round(body.months ?? 3)));

  const schedules = await prisma.complianceSchedule.findMany({
    where: { active: true, ...(body.scheduleId ? { id: body.scheduleId } : {}) },
  });

  const candidates = schedules.flatMap((s) =>
    computeOccurrences(
      { title: s.title, frequency: s.frequency, dueDay: s.dueDay, anchorMonth: s.anchorMonth },
      months,
    ).map((o) => ({ occurrence: o, schedule: s })),
  );

  if (candidates.length === 0) return ok({ created: 0, months });

  const scheduleIds = [...new Set(candidates.map((c) => c.schedule.id))];
  const existing = await prisma.task.findMany({
    where: { scheduleId: { in: scheduleIds } },
    select: { scheduleId: true, periodKey: true },
  });
  const seen = new Set(existing.map((e) => `${e.scheduleId}|${e.periodKey}`));

  const toCreate = candidates.filter(
    (c) => !seen.has(`${c.schedule.id}|${c.occurrence.periodKey}`),
  );
  if (toCreate.length === 0) return ok({ created: 0, months });

  const RETURN_CATEGORIES = ["GST", "Income Tax", "TDS"];
  await prisma.task.createMany({
    data: toCreate.map((c) => ({
      title: c.occurrence.title,
      category: c.schedule.category,
      status: "Pending",
      priority: c.schedule.priority,
      dueDate: c.occurrence.dueDate,
      clientId: c.schedule.clientId,
      assigneeId: c.schedule.assigneeId,
      scheduleId: c.schedule.id,
      periodKey: c.occurrence.periodKey,
      isReturnFiling: RETURN_CATEGORIES.includes(c.schedule.category),
    })),
  });

  return ok({ created: toCreate.length, months });
});
