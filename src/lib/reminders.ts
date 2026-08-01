import "server-only";
import { startOfDay, addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatDate, dueLabel } from "@/lib/format";
import { deliver } from "@/lib/notify";
import { getDefaultOrg } from "@/lib/org";

export type ReminderCandidate = {
  taskId: string | null;
  taskTitle: string; // task title, or a "DSC: …" label for expiry reminders
  clientName: string | null;
  channel: "Email" | "WhatsApp";
  recipientType: "Staff" | "Client";
  recipientName: string;
  to: string;
  subject: string;
  body: string;
  dueDate: Date;
  dedupeKey: string;
};

type TaskWithRefs = Awaited<ReturnType<typeof loadDueTasks>>[number];

/**
 * How the firm signs off on anything it sends a client. Read from the billing
 * organization, so a firm's own name appears on its reminders — these used to
 * carry the demo firm's name regardless of who was running the portal.
 */
export async function firmSignature(): Promise<{ name: string; full: string }> {
  const org = await getDefaultOrg();
  const name = org?.name?.trim() || "your Chartered Accountants";
  const tagline = org?.tagline?.trim();
  return { name, full: tagline ? `${name}, ${tagline}` : name };
}

/** Get the singleton settings row, creating it with defaults if absent. */
export async function getSettings() {
  return prisma.reminderSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

function loadDueTasks(horizon: Date) {
  return prisma.task.findMany({
    where: { status: { not: "Completed" }, dueDate: { not: null, lte: horizon } },
    include: { client: true, assignee: true },
    orderBy: { dueDate: "asc" },
  });
}

function render(
  channel: "Email" | "WhatsApp",
  recipientType: "Staff" | "Client",
  name: string,
  task: TaskWithRefs,
  due: Date,
  firm: { name: string; full: string },
) {
  const firstName = name.replace(/^CA\s+/, "").split(" ")[0];
  const forClient = task.client ? ` for ${task.client.name}` : "";
  const status = dueLabel(due).toLowerCase();
  const subject = `Reminder: ${task.title} (due ${formatDate(due)})`;

  if (channel === "WhatsApp") {
    const body =
      recipientType === "Client"
        ? `Dear ${firstName}, a reminder from ${firm.name}: *${task.title}* is due on ${formatDate(due)}. Please share the required details/documents at the earliest. Thank you.`
        : `⏰ *${task.title}*${forClient} — ${status} (due ${formatDate(due)}). Priority: ${task.priority}. — ${firm.name}`;
    return { subject, body };
  }

  const body =
    recipientType === "Client"
      ? `Dear ${firstName},\n\nThis is a reminder from ${firm.name} regarding "${task.title}", due on ${formatDate(due)}. Kindly share the required information/documents at the earliest so we can complete it on time.\n\nWarm regards,\n${firm.full}`
      : `Hi ${firstName},\n\nReminder: "${task.title}"${forClient} is ${status} (due ${formatDate(due)}).\nCategory: ${task.category} · Priority: ${task.priority}.\n\nOpen Ledgify to update its status.\n\n— ${firm.name} · Ledgify`;
  return { subject, body };
}

/**
 * Renewal reminders for certificates that have expired, or expire within
 * `days`. Shared by the nightly run and the "send now" action on the DSC
 * register, so a manual send says exactly what the automatic one would.
 *
 * `dscIds` narrows it to a hand-picked set (the manual path); omit it for
 * every certificate inside the window.
 */
export async function dscRenewalCandidates(opts: {
  days: number;
  channels: ("Email" | "WhatsApp")[];
  firm: { name: string; full: string };
  dscIds?: string[];
  todayIso?: string;
}): Promise<ReminderCandidate[]> {
  const today = startOfDay(new Date());
  const todayIso = opts.todayIso ?? format(today, "yyyy-MM-dd");
  const horizon = addDays(today, opts.days);

  const dscs = await prisma.dsc.findMany({
    where: {
      status: "Active",
      expiryDate: { lte: horizon },
      ...(opts.dscIds?.length ? { id: { in: opts.dscIds } } : {}),
    },
    include: { client: true },
    orderBy: { expiryDate: "asc" },
  });

  const out: ReminderCandidate[] = [];
  for (const d of dscs) {
    const name = d.holderName;
    const firstName = name.split(" ")[0];
    const email = d.email || d.client?.email || null;
    const phone = d.phone || d.client?.phone || null;
    const expired = d.expiryDate < today;
    const subject = `Reminder: DSC of ${name} ${expired ? "has expired" : `expires ${formatDate(d.expiryDate)}`}`;

    for (const channel of opts.channels) {
      const to = channel === "Email" ? email : phone;
      if (!to) continue;
      const when = expired
        ? `expired on ${formatDate(d.expiryDate)}`
        : `expires on ${formatDate(d.expiryDate)}`;
      const body =
        channel === "WhatsApp"
          ? `Dear ${firstName}, your ${d.class} DSC${d.client ? ` (${d.client.name})` : ""} ${when}. Please arrange renewal to avoid filing delays. — ${opts.firm.name}`
          : `Dear ${firstName},\n\nYour ${d.class} Digital Signature Certificate${d.client ? ` associated with ${d.client.name}` : ""} ${when}.\n\nPlease arrange its renewal at the earliest so statutory filings are not delayed. We can assist with the renewal process.\n\nWarm regards,\n${opts.firm.full}`;
      out.push({
        taskId: null,
        taskTitle: `DSC expiry: ${name} (${d.class})`,
        clientName: d.client?.name ?? null,
        channel,
        recipientType: "Client",
        recipientName: name,
        to,
        subject,
        body,
        dueDate: d.expiryDate,
        dedupeKey: `dsc:${d.id}:${channel}:${to}:${todayIso}`,
      });
    }
  }
  return out;
}

/** Compute every reminder that would be sent right now, given settings. */
export async function computeCandidates(
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<ReminderCandidate[]> {
  if (!settings.enabled) return [];

  const today = startOfDay(new Date());
  const horizon = addDays(today, settings.leadDays);
  const todayIso = format(today, "yyyy-MM-dd");

  const channels: ("Email" | "WhatsApp")[] = [];
  if (settings.channelEmail) channels.push("Email");
  if (settings.channelWhatsapp) channels.push("WhatsApp");
  if (channels.length === 0) return [];

  const firm = await firmSignature();
  const tasks = await loadDueTasks(horizon);
  const out: ReminderCandidate[] = settings.notifyDscExpiry
    ? await dscRenewalCandidates({ days: settings.dscLeadDays, channels, firm, todayIso })
    : [];

  for (const t of tasks) {
    const due = t.dueDate!;
    const recipients: {
      type: "Staff" | "Client";
      name: string;
      email: string | null;
      phone: string | null;
    }[] = [];
    if (settings.notifyAssignee && t.assignee) {
      recipients.push({ type: "Staff", name: t.assignee.name, email: t.assignee.email, phone: t.assignee.phone });
    }
    if (settings.notifyClient && t.client) {
      recipients.push({
        type: "Client",
        name: t.client.contactPerson || t.client.name,
        email: t.client.email,
        phone: t.client.phone,
      });
    }

    for (const r of recipients) {
      for (const channel of channels) {
        const to = channel === "Email" ? r.email : r.phone;
        if (!to) continue;
        const { subject, body } = render(channel, r.type, r.name, t, due, firm);
        out.push({
          taskId: t.id,
          taskTitle: t.title,
          clientName: t.client?.name ?? null,
          channel,
          recipientType: r.type,
          recipientName: r.name,
          to,
          subject,
          body,
          dueDate: due,
          dedupeKey: `${t.id}:${channel}:${to}:${todayIso}`,
        });
      }
    }
  }
  return out;
}

export type SendResult = {
  total: number;
  sent: number;
  simulated: number;
  failed: number;
  skipped: number;
};

/**
 * Deliver a set of candidates and log every one. Anything already logged
 * under the same dedupe key is skipped, so re-running — or clicking "send"
 * twice — never double-messages a client.
 *
 * `force` bypasses that for a deliberate manual send: the operator asked for
 * it, so it goes out even if the nightly run already covered it today.
 */
export async function sendCandidates(
  candidates: ReminderCandidate[],
  opts: { force?: boolean } = {},
): Promise<SendResult> {
  const result: SendResult = {
    total: candidates.length,
    sent: 0,
    simulated: 0,
    failed: 0,
    skipped: 0,
  };
  if (candidates.length === 0) return result;

  let fresh = candidates;
  if (!opts.force) {
    const existing = await prisma.notificationLog.findMany({
      where: { dedupeKey: { in: candidates.map((c) => c.dedupeKey) } },
      select: { dedupeKey: true },
    });
    const seen = new Set(existing.map((e) => e.dedupeKey));
    fresh = candidates.filter((c) => !seen.has(c.dedupeKey));
    result.skipped = candidates.length - fresh.length;
  }

  for (const c of fresh) {
    const status = await deliver(c.channel, c.to, c.subject, c.body);
    if (status === "Sent") result.sent++;
    else if (status === "Simulated") result.simulated++;
    else result.failed++;
    await prisma.notificationLog.create({
      data: {
        channel: c.channel,
        recipientType: c.recipientType,
        recipientName: c.recipientName,
        to: c.to,
        subject: c.subject,
        body: c.body,
        status,
        taskId: c.taskId,
        // A forced re-send must not collide with the entry already logged.
        dedupeKey: opts.force ? `${c.dedupeKey}:${Date.now()}` : c.dedupeKey,
      },
    });
  }
  return result;
}

/** Send (or simulate) all due reminders, skipping ones already sent today. */
export async function runReminders() {
  const settings = await getSettings();
  return sendCandidates(await computeCandidates(settings));
}
