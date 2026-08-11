import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { findExistingTaskDuplicates } from "@/lib/task-duplicates";

// Duplicity check over the existing register: obligations — a client's return
// for a given form and period — carrying more than one task.
//
// It reads across the whole register, so it is for those who may see the whole
// register; a staff member's list is filtered to their own work.
export const GET = route(async () => {
  await requirePermission("viewAllTasks");
  return ok(await findExistingTaskDuplicates());
});
