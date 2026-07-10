import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";

// Public: reports only whether the portal has been initialised. Used by the
// login and setup pages before any account exists.
export const GET = route(async () => {
  const staffCount = await prisma.staff.count();
  return ok({ needsSetup: staffCount === 0 });
});
