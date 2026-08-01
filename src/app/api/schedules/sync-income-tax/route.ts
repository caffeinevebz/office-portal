import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { STATUTORY_CALENDAR, type StatutoryLaw } from "@/lib/it-calendar";

// Sync the built-in statutory calendars — Income Tax, GST and MCA/ROC — into
// the firm's recurring schedules. Idempotent: entries are keyed by sourceKey,
// so re-running updates dates in place and never duplicates. Schedules the
// user deactivated stay deactivated.
//
// POST { law?: "Income Tax" | "GST" | "MCA" } syncs one calendar; omit it to
// sync all three.
const SOURCE: Record<StatutoryLaw, string> = {
  "Income Tax": "income-tax",
  GST: "gst",
  MCA: "mca",
};

export const POST = route(async (req) => {
  await requirePermission("manageSchedules");
  const body = (await req.json().catch(() => ({}))) as { law?: string };
  const wanted = body.law && body.law !== "All" ? body.law : null;
  const entries = STATUTORY_CALENDAR.filter((e) => !wanted || e.law === wanted);

  let created = 0;
  let updated = 0;
  for (const e of entries) {
    const sourceKey = `${SOURCE[e.law]}:${e.key}`;
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
          source: SOURCE[e.law],
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
    unchanged: entries.length - created - updated,
    total: entries.length,
    law: wanted ?? "All",
  });
});
