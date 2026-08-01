import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { STATUTORY_CALENDAR, STATUTORY_LAWS } from "@/lib/it-calendar";
import { occurrencesBetween } from "@/lib/schedule";

/**
 * The statutory due dates falling inside a window — the Income Tax, GST and
 * MCA/ROC calendars expanded into concrete dates so the calendar page can
 * paint them alongside the firm's own tasks. Pure computation, no database.
 */
export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const from = new Date(searchParams.get("from") ?? new Date());
  const to = new Date(searchParams.get("to") ?? new Date());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return ok({ laws: STATUTORY_LAWS, entries: [] });
  }
  const law = searchParams.get("law")?.trim();

  const entries = STATUTORY_CALENDAR.filter((e) => !law || law === "All" || e.law === law).flatMap(
    (e) =>
      occurrencesBetween(
        { title: e.title, frequency: e.frequency, dueDay: e.dueDay, anchorMonth: e.anchorMonth },
        from,
        to,
      ).map((o) => ({
        key: e.key,
        law: e.law,
        category: e.category,
        title: e.title,
        // The occurrence title carries the period, e.g. "… — June 2026".
        occurrenceTitle: o.title,
        dueDate: o.dueDate,
        priority: e.priority,
        notes: e.notes,
      })),
  );

  entries.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return ok({ laws: STATUTORY_LAWS, entries });
});
