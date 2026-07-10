import { ok, fail, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return fail("Not authenticated", 401);
  return ok(user);
});
