import "server-only";
import { prisma } from "@/lib/prisma";
import { computeOccurrences, occurrencesBetween, type Occurrence } from "@/lib/schedule";
import { defaultChecklist } from "@/lib/constants";
import type { ChecklistItem } from "@/lib/types";
import type { ComplianceSchedule } from "@prisma/client";

// Turning recurring obligations into dated tasks. Two ways in:
//
//   • automatically, at the start of the month an occurrence falls due — the
//     firm should not have to remember to press a button for work the law
//     already scheduled;
//   • on demand, for several months ahead, from the Recurring tab.
//
// Both go through `createTasks`, so a task generated either way is identical.

/** Return-filing categories complete by recording a filing entry. */
const RETURN_CATEGORIES = ["GST", "Income Tax", "TDS"];

/**
 * The checklist a generated task starts with: the obligation's own if the
 * firm defined one, else the standard steps for its category.
 */
function checklistFor(schedule: ComplianceSchedule): ChecklistItem[] | null {
  const own = schedule.checklist as ChecklistItem[] | null;
  if (Array.isArray(own) && own.length > 0) {
    // Always fresh — an obligation's checklist is a template, not state.
    return own.map((i) => ({ label: i.label, done: false }));
  }
  const fallback = defaultChecklist(schedule.category, {});
  return fallback.length > 0 ? fallback : null;
}

/**
 * Create the tasks for a set of occurrences. Idempotent twice over: existing
 * (schedule, period) pairs are filtered out first, and the unique index backs
 * that up, so two servers generating at once cannot duplicate.
 */
export async function createTasks(
  pairs: { schedule: ComplianceSchedule; occurrence: Occurrence }[],
): Promise<number> {
  if (pairs.length === 0) return 0;

  const scheduleIds = [...new Set(pairs.map((p) => p.schedule.id))];
  const existing = await prisma.task.findMany({
    where: { scheduleId: { in: scheduleIds } },
    select: { scheduleId: true, periodKey: true },
  });
  const seen = new Set(existing.map((e) => `${e.scheduleId}|${e.periodKey}`));
  const fresh = pairs.filter((p) => !seen.has(`${p.schedule.id}|${p.occurrence.periodKey}`));
  if (fresh.length === 0) return 0;

  // Tasks carry the GSTIN as text too (it is what the register displays), so
  // resolve the registrations the obligations point at.
  const regIds = [...new Set(fresh.map((p) => p.schedule.gstRegistrationId).filter(Boolean))];
  const gstinById = new Map(
    regIds.length
      ? (
          await prisma.gstRegistration.findMany({
            where: { id: { in: regIds as string[] } },
            select: { id: true, gstin: true },
          })
        ).map((r) => [r.id, r.gstin])
      : [],
  );

  const { count } = await prisma.task.createMany({
    data: fresh.map(({ schedule, occurrence }) => ({
      title: occurrence.title,
      category: schedule.category,
      status: "Pending",
      priority: schedule.priority,
      dueDate: occurrence.dueDate,
      clientId: schedule.clientId,
      // The concern and the GST registration the obligation runs for travel
      // onto every task, so a client with two GSTINs gets two distinct ones.
      tradeNameId: schedule.tradeNameId,
      gstRegistrationId: schedule.gstRegistrationId,
      gstin: schedule.gstRegistrationId ? (gstinById.get(schedule.gstRegistrationId) ?? null) : null,
      assigneeId: schedule.assigneeId,
      scheduleId: schedule.id,
      periodKey: occurrence.periodKey,
      isReturnFiling: RETURN_CATEGORIES.includes(schedule.category),
      checklist: checklistFor(schedule) ?? undefined,
      description: schedule.notes,
    })),
    skipDuplicates: true,
  });
  return count;
}

/** Generate every occurrence falling due in `when`'s month. */
export async function generateForMonth(when = new Date(), scheduleId?: string) {
  const from = new Date(when.getFullYear(), when.getMonth(), 1);
  const to = new Date(when.getFullYear(), when.getMonth() + 1, 0, 23, 59, 59, 999);

  const schedules = await prisma.complianceSchedule.findMany({
    where: { active: true, ...(scheduleId ? { id: scheduleId } : {}) },
  });
  const pairs = schedules.flatMap((schedule) =>
    occurrencesBetween(
      {
        title: schedule.title,
        frequency: schedule.frequency,
        dueDay: schedule.dueDay,
        anchorMonth: schedule.anchorMonth,
      },
      from,
      to,
    ).map((occurrence) => ({ schedule, occurrence })),
  );
  return { created: await createTasks(pairs), month: from };
}

/** Generate everything falling due in the next `months` months. */
export async function generateAhead(months: number, scheduleId?: string) {
  const schedules = await prisma.complianceSchedule.findMany({
    where: { active: true, ...(scheduleId ? { id: scheduleId } : {}) },
  });
  const pairs = schedules.flatMap((schedule) =>
    computeOccurrences(
      {
        title: schedule.title,
        frequency: schedule.frequency,
        dueDay: schedule.dueDay,
        anchorMonth: schedule.anchorMonth,
      },
      months,
    ).map((occurrence) => ({ schedule, occurrence })),
  );
  return { created: await createTasks(pairs), months };
}

// This month's tasks are generated on the first read of the month, rather
// than by a clock the app does not own — a serverless deployment has no
// resident scheduler, and the work must appear whether or not anyone
// remembers to press a button. The marker keeps it to one pass per process
// per month; the idempotency above makes extra passes harmless anyway.
let generatedFor: string | null = null;

export async function ensureCurrentMonthTasks(): Promise<void> {
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}`;
  if (generatedFor === key) return;
  generatedFor = key;
  try {
    await generateForMonth(now);
  } catch {
    // Never let generation break the list it was meant to fill; the next
    // process (or an explicit Generate) will pick it up.
    generatedFor = null;
  }
}
