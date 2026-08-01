import { format } from "date-fns";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { bulletinSendSchema } from "@/lib/validation";
import { firmSignature, sendCandidates } from "@/lib/reminders";
import {
  bulletinCandidates,
  bulletinClients,
  bulletinEntries,
  periodLabel,
  renderBulletin,
} from "@/lib/statutory-bulletin";
import { STATUTORY_LAWS } from "@/lib/it-calendar";

/**
 * Preview the circular: the statutory dates in the period, every client who
 * could receive it, and the exact message one of them would get. Nothing is
 * sent — this is what the firm reads before deciding to write to everyone.
 */
export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const from = new Date(searchParams.get("from") ?? "");
  const to = new Date(searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail("Choose the period to circulate", 400);
  }
  const laws = (searchParams.get("laws") ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter((l) => (STATUTORY_LAWS as readonly string[]).includes(l));

  const entries = bulletinEntries(from, to, laws);
  const clients = await bulletinClients();
  const firm = await firmSignature();
  const period = periodLabel(from, to);

  const sample = clients.find((c) => c.email) ?? clients[0];
  return ok({
    period,
    laws: laws.length > 0 ? laws : [...STATUTORY_LAWS],
    entries,
    clients: clients.map((c) => ({
      ...c,
      reachable: Boolean(c.email || c.phone),
    })),
    reachable: {
      email: clients.filter((c) => c.email).length,
      whatsapp: clients.filter((c) => c.phone).length,
      total: clients.length,
    },
    // What one client will actually read.
    preview:
      entries.length > 0 && sample
        ? renderBulletin("Email", sample.contactPerson || sample.name, entries, period, firm)
        : null,
  });
});

/** Send the circular to the chosen clients (every reachable one by default). */
export const POST = route(async (req) => {
  await requirePermission("manageReminders");
  const { from, to, laws, clientIds, channels } = await parse(req, bulletinSendSchema);

  const entries = bulletinEntries(from, to, laws);
  if (entries.length === 0) {
    return fail("No statutory due dates fall in that period for the laws selected", 400);
  }

  const all = await bulletinClients();
  const clients = clientIds?.length ? all.filter((c) => clientIds.includes(c.id)) : all;
  const firm = await firmSignature();
  const period = periodLabel(from, to);

  const candidates = bulletinCandidates({
    clients,
    entries,
    period,
    channels,
    firm,
    // One circular per period per client: re-sending the same period is
    // skipped, while next month's goes out normally.
    stamp: `${format(from, "yyyy-MM-dd")}:${format(to, "yyyy-MM-dd")}`,
  });
  if (candidates.length === 0) {
    return fail("None of the selected clients have an email or phone to write to", 400);
  }

  const result = await sendCandidates(candidates);
  return ok({ ...result, period, dueDates: entries.length, clients: clients.length });
});
