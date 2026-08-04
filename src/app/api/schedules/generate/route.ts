import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { generateAhead, generateForMonth } from "@/lib/generate";

/**
 * Generate dated tasks from the recurring obligations.
 *
 * `{ mode: "month" }` does what the app does by itself at the start of every
 * month — the occurrences falling due in the current month — and is what a
 * daily scheduler should call. `{ months: n }` reaches further ahead, which
 * is what the Recurring tab's button offers.
 *
 * Idempotent either way: an occurrence already generated is skipped.
 */
export const POST = route(async (req) => {
  await requirePermission("manageSchedules");
  const body = (await req.json().catch(() => ({}))) as {
    months?: number;
    mode?: string;
    scheduleId?: string;
  };

  if (body.mode === "month") {
    const { created, month } = await generateForMonth(new Date(), body.scheduleId);
    return ok({ created, mode: "month", month });
  }

  const months = Math.min(12, Math.max(1, Math.round(body.months ?? 3)));
  return ok(await generateAhead(months, body.scheduleId));
});
