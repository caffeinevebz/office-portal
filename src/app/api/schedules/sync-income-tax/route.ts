import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { IT_CALENDAR, IT_CALENDAR_SOURCE } from "@/lib/it-calendar";

// Sync the built-in Income Tax Department compliance calendar into the
// firm's recurring schedules. Idempotent: entries are keyed by sourceKey,
// so re-running updates dates in place and never duplicates. Schedules the
// user deactivated stay deactivated.
export const POST = route(async () => {
  await requirePermission("manageSchedules");

  let created = 0;
  let updated = 0;
  for (const e of IT_CALENDAR) {
    const sourceKey = `${IT_CALENDAR_SOURCE}:${e.key}`;
    const existing = await prisma.complianceSchedule.findUnique({ where: { sourceKey } });
    if (!existing) {
      await prisma.complianceSchedule.create({
        data: {
          title: e.title,
          category: e.category,
          frequency: e.frequency,
          dueDay: e.dueDay,
          anchorMonth: e.anchorMonth,
          priority: e.priority,
          notes: e.notes,
          source: IT_CALENDAR_SOURCE,
          sourceKey,
        },
      });
      created++;
    } else {
      const changed =
        existing.title !== e.title ||
        existing.category !== e.category ||
        existing.frequency !== e.frequency ||
        existing.dueDay !== e.dueDay ||
        existing.anchorMonth !== e.anchorMonth ||
        existing.notes !== e.notes;
      if (changed) {
        await prisma.complianceSchedule.update({
          where: { sourceKey },
          data: {
            title: e.title,
            category: e.category,
            frequency: e.frequency,
            dueDay: e.dueDay,
            anchorMonth: e.anchorMonth,
            notes: e.notes,
          },
        });
        updated++;
      }
    }
  }

  return ok({
    created,
    updated,
    unchanged: IT_CALENDAR.length - created - updated,
    total: IT_CALENDAR.length,
  });
});
