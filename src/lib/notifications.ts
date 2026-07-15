import "server-only";
import { prisma } from "@/lib/prisma";

type NotificationInput = {
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

/** Create the same in-app notification for a set of team members. */
export async function notifyStaff(staffIds: string[], n: NotificationInput) {
  const ids = [...new Set(staffIds)].filter(Boolean);
  if (!ids.length) return;
  await prisma.appNotification.createMany({
    data: ids.map((staffId) => ({
      staffId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
    })),
  });
}

/**
 * Notify team members they have been assigned to a task (skipping whoever
 * performed the assignment — no point pinging yourself).
 */
export async function notifyTaskAssignment(opts: {
  staffIds: string[];
  actorId: string;
  actorName: string;
  taskTitle: string;
  clientName?: string | null;
  dueDate?: Date | null;
  count?: number; // >1 when the task was created for several clients at once
}) {
  const recipients = opts.staffIds.filter((id) => id !== opts.actorId);
  if (!recipients.length) return;
  const many = (opts.count ?? 1) > 1;
  const due = opts.dueDate
    ? ` · due ${opts.dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
    : "";
  await notifyStaff(recipients, {
    type: "task-assigned",
    title: many
      ? `${opts.count} new tasks assigned: ${opts.taskTitle}`
      : `New task assigned: ${opts.taskTitle}`,
    body: `${many ? "Across several clients" : (opts.clientName ?? "Internal")}${due} · by ${opts.actorName}`,
    href: "/tasks",
  });
}

/** Notify a Partner/Admin they are the approver on a task. */
export async function notifyTaskApprover(opts: {
  approverId: string;
  actorId: string;
  actorName: string;
  taskTitle: string;
}) {
  if (!opts.approverId || opts.approverId === opts.actorId) return;
  await notifyStaff([opts.approverId], {
    type: "task-approver",
    title: `Approval requested: ${opts.taskTitle}`,
    body: `You give the final sign-off on this task · by ${opts.actorName}`,
    href: "/tasks",
  });
}
