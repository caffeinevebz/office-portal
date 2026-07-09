import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getSettings, computeCandidates } from "@/lib/reminders";
import { providerStatus } from "@/lib/notify";

export const GET = route(async () => {
  await requireUser();
  const settings = await getSettings();
  const candidates = await computeCandidates(settings);
  return ok({ candidates, provider: providerStatus(), settings });
});
