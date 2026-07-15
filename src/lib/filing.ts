import "server-only";
import { prisma } from "@/lib/prisma";

const FILED_STATES = ["Filed", "E-Verified", "Processed"];

/**
 * When a filing-register entry is linked to a task, reflect the filing onto
 * that task so the task shows as filed — mirroring the task→register flow, but
 * driven from the register side (link by client / PAN / TAN / GST / CIN).
 * No-op when the entry isn't linked to a task.
 */
export async function mirrorFilingToTask(filing: {
  taskId: string | null;
  filedOn: Date | null;
  ackNumber: string | null;
  status: string;
}) {
  if (!filing.taskId) return;
  const filed = FILED_STATES.includes(filing.status) || !!filing.filedOn;
  const when = filing.filedOn ?? new Date();
  await prisma.task.update({
    where: { id: filing.taskId },
    data: {
      isReturnFiling: true,
      ...(filing.ackNumber ? { ackNumber: filing.ackNumber } : {}),
      ...(filed ? { filingDate: when, status: "Completed", completedAt: when } : {}),
    },
  });
}
