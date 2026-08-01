import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { dscRemindSchema } from "@/lib/validation";
import { dscRenewalCandidates, firmSignature, sendCandidates } from "@/lib/reminders";
import { startOfDay, addDays } from "date-fns";

/** The default window the register offers: expired, or expiring within a month. */
const DEFAULT_DAYS = 30;

/**
 * Which certificates would be reminded about, and whether each holder can
 * actually be reached. Drives the "send renewal reminders" picker, so the
 * firm sees exactly who will be written to before anything goes out.
 */
export const GET = route(async (req) => {
  await requireUser();
  const days = Number(new URL(req.url).searchParams.get("days") ?? DEFAULT_DAYS);
  const window = Number.isFinite(days) ? Math.max(0, Math.min(365, days)) : DEFAULT_DAYS;
  const today = startOfDay(new Date());

  const dscs = await prisma.dsc.findMany({
    where: { status: "Active", expiryDate: { lte: addDays(today, window) } },
    include: { client: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { expiryDate: "asc" },
  });

  return ok({
    days: window,
    items: dscs.map((d) => {
      // The holder's own contact wins; the client's is the fallback.
      const email = d.email || d.client?.email || null;
      const phone = d.phone || d.client?.phone || null;
      return {
        id: d.id,
        holderName: d.holderName,
        class: d.class,
        clientName: d.client?.name ?? null,
        expiryDate: d.expiryDate,
        expired: d.expiryDate < today,
        email,
        phone,
        reachable: Boolean(email || phone),
      };
    }),
  });
});

/**
 * Send renewal reminders for the chosen certificates now, rather than waiting
 * for the nightly run. Forced: the operator asked for it, so it goes out even
 * if today's automatic run already covered the same certificate.
 */
export const POST = route(async (req) => {
  await requirePermission("manageReminders");
  const { dscIds, channels, days } = await parse(req, dscRemindSchema);

  const firm = await firmSignature();
  const candidates = await dscRenewalCandidates({
    days: days ?? DEFAULT_DAYS,
    channels,
    firm,
    dscIds,
  });
  if (candidates.length === 0) {
    return fail("None of the selected certificates have an email or phone to write to", 400);
  }

  const result = await sendCandidates(candidates, { force: true });
  return ok({ ...result, recipients: candidates.map((c) => ({ name: c.recipientName, to: c.to })) });
});
