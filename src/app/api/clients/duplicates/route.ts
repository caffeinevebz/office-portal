import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { findExistingDuplicates } from "@/lib/clients";

// Duplicity check over the existing register: clients sharing a PAN, and
// same-named clients with no PAN to tell them apart.
export const GET = route(async () => {
  await requireUser();
  return ok(await findExistingDuplicates());
});
