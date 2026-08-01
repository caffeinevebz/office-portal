import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { STATUTORY_CALENDAR, STATUTORY_LAWS, type StatutoryLaw } from "@/lib/it-calendar";
import { occurrencesBetween } from "@/lib/schedule";
import type { ReminderCandidate } from "@/lib/reminders";

// A circular to every client listing the statutory dates falling due in a
// period — the "please note these dates" mail a firm sends at the start of a
// month. The dates come from the built-in calendars, so no one has to type
// them out, and each client gets one message covering all of them rather than
// one message per date.

export type BulletinEntry = {
  law: StatutoryLaw;
  title: string;
  dueDate: Date;
  notes: string;
};

/** The statutory dates falling inside a window, under the chosen laws. */
export function bulletinEntries(from: Date, to: Date, laws: string[]): BulletinEntry[] {
  const wanted = laws.length > 0 ? laws : [...STATUTORY_LAWS];
  return STATUTORY_CALENDAR.filter((e) => wanted.includes(e.law))
    .flatMap((e) =>
      occurrencesBetween(
        { title: e.title, frequency: e.frequency, dueDay: e.dueDay, anchorMonth: e.anchorMonth },
        from,
        to,
      ).map((o) => ({ law: e.law, title: e.title, dueDate: o.dueDate, notes: e.notes })),
    )
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** How the period reads in the subject line, e.g. "August 2026". */
export function periodLabel(from: Date, to: Date): string {
  return format(from, "MMMM yyyy") === format(to, "MMMM yyyy")
    ? format(from, "MMMM yyyy")
    : `${formatDate(from)} – ${formatDate(to)}`;
}

/** The dated list that forms the body of the circular. */
function renderList(entries: BulletinEntry[], channel: "Email" | "WhatsApp"): string {
  return entries
    .map((e) =>
      channel === "WhatsApp"
        ? `• ${format(e.dueDate, "dd MMM")} — ${e.title} (${e.law})`
        : `  ${format(e.dueDate, "dd MMM yyyy")}  ·  ${e.law}\n      ${e.title}\n      ${e.notes}`,
    )
    .join("\n");
}

export function renderBulletin(
  channel: "Email" | "WhatsApp",
  recipientName: string,
  entries: BulletinEntry[],
  period: string,
  firm: { name: string; full: string },
): { subject: string; body: string } {
  const firstName = recipientName.replace(/^(M\/s|Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(" ")[0];
  const subject = `Statutory due dates — ${period}`;

  if (channel === "WhatsApp") {
    return {
      subject,
      body:
        `Dear ${firstName}, the statutory due dates for *${period}*:\n\n${renderList(entries, channel)}\n\n` +
        `Please share the required details and documents in good time so the filings are made before the dates above. — ${firm.name}`,
    };
  }
  return {
    subject,
    body:
      `Dear ${firstName},\n\nPlease note the following statutory due dates falling in ${period}:\n\n` +
      `${renderList(entries, channel)}\n\n` +
      `Kindly arrange to share the required details and documents well before these dates so that the filings applicable to you are completed on time. ` +
      `Not every date above will apply to you — we will write separately about the ones that do.\n\n` +
      `Warm regards,\n${firm.full}`,
  };
}

export type BulletinClient = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
};

/** Active clients, with the contact each channel would use. */
export async function bulletinClients(): Promise<BulletinClient[]> {
  return prisma.client.findMany({
    where: { status: "Active" },
    select: { id: true, name: true, contactPerson: true, email: true, phone: true },
    orderBy: { name: "asc" },
  });
}

/** One message per client per channel, for the clients that can be reached. */
export function bulletinCandidates(opts: {
  clients: BulletinClient[];
  entries: BulletinEntry[];
  period: string;
  channels: ("Email" | "WhatsApp")[];
  firm: { name: string; full: string };
  stamp: string;
}): ReminderCandidate[] {
  const out: ReminderCandidate[] = [];
  for (const c of opts.clients) {
    const name = c.contactPerson || c.name;
    for (const channel of opts.channels) {
      const to = channel === "Email" ? c.email : c.phone;
      if (!to) continue;
      const { subject, body } = renderBulletin(channel, name, opts.entries, opts.period, opts.firm);
      out.push({
        taskId: null,
        taskTitle: `Statutory due dates — ${opts.period}`,
        clientName: c.name,
        channel,
        recipientType: "Client",
        recipientName: name,
        to,
        subject,
        body,
        dueDate: opts.entries[0]?.dueDate ?? new Date(),
        dedupeKey: `bulletin:${opts.stamp}:${c.id}:${channel}:${to}`,
      });
    }
  }
  return out;
}
