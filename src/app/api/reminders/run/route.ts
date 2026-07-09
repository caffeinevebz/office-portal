import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { runReminders } from "@/lib/reminders";
import { providerStatus } from "@/lib/notify";

// Send (or simulate) all due reminders. This is the endpoint a daily scheduler
// (cron) would call; it is safe to call repeatedly — already-sent reminders are
// skipped for the day.
export const POST = route(async () => {
  await requirePermission("manageReminders");
  const result = await runReminders();
  return ok({ ...result, provider: providerStatus() });
});
