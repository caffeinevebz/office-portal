import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { conversationList } from "@/lib/chat";

// Every conversation open to the signed-in member: the firm-wide Team
// channel plus a direct thread with each colleague.
export const GET = route(async () => {
  const user = await requireUser();
  return ok(await conversationList(user.id));
});
