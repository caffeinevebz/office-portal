import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { taskUpdateSchema } from "@/lib/validation";
import {
  findTaskDuplicate,
  duplicateTaskMessage,
  complianceKey,
  IDENTITY_SELECT,
  type TaskIdentity,
} from "@/lib/task-duplicates";

/**
 * Weigh a task the form is still composing. Answering before the user presses
 * Create is the point: a warning while the form is open costs nothing, where a
 * refusal afterwards means retyping. Never writes anything.
 */
export const POST = route(async (req) => {
  await requirePermission("manageTasks");
  // Editing a task must not find the task itself.
  const excludeId = new URL(req.url).searchParams.get("excludeId")?.trim() || undefined;
  const { clientIds, gstTargets, ...data } = await parse(req, taskUpdateSchema);

  // The batch forms raise one task per client / per GSTIN, so each candidate
  // is weighed on its own and the answer names the ones already covered.
  const names =
    clientIds && clientIds.length > 0
      ? new Map(
          (
            await prisma.client.findMany({
              where: { id: { in: clientIds } },
              select: { id: true, name: true },
            })
          ).map((c) => [c.id, c.name]),
        )
      : new Map<string, string>();

  const candidates: { label: string | null; identity: TaskIdentity }[] =
    clientIds && clientIds.length > 0
      ? clientIds.map((clientId) => ({
          label: names.get(clientId) ?? null,
          identity: { ...data, clientId },
        }))
      : gstTargets && gstTargets.length > 0
        ? gstTargets.map((t) => ({ label: t.gstin ?? null, identity: { ...data, gstin: t.gstin } }))
        : [{ label: null, identity: data }];

  // Editing: the answer is about where the task is being *moved* to. A form
  // that has not shifted the obligation warns about nothing — otherwise a task
  // deliberately raised alongside another would nag on every open.
  const before = excludeId
    ? complianceKey(
        (await prisma.task.findUnique({ where: { id: excludeId }, select: IDENTITY_SELECT })) ?? {},
      )
    : null;

  const hits = [];
  for (const { label, identity } of candidates) {
    if (before && complianceKey(identity) === before) continue;
    const dup = await findTaskDuplicate(identity, excludeId);
    if (dup) hits.push({ label, message: duplicateTaskMessage(dup), taskId: dup.id });
  }
  return ok({ duplicates: hits });
});
