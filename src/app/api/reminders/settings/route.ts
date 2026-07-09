import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { reminderSettingsSchema } from "@/lib/validation";
import { getSettings } from "@/lib/reminders";

export const GET = route(async () => {
  await requireUser();
  return ok(await getSettings());
});

export const PUT = route(async (req) => {
  await requirePermission("manageReminders");
  const data = await parse(req, reminderSettingsSchema);
  const settings = await prisma.reminderSettings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  });
  return ok(settings);
});
