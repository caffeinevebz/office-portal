import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { latestIncoming, unreadChatCount } from "@/lib/chat";

/**
 * Everything the app shell polls for in one round-trip: the member's
 * notifications and their unread chat state. One request keeps the polling
 * cost flat as more alert sources are added.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const [items, unread, chatUnread, chatLatest] = await Promise.all([
    prisma.appNotification.findMany({
      where: { staffId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.appNotification.count({ where: { staffId: user.id, readAt: null } }),
    unreadChatCount(user.id),
    latestIncoming(user.id),
  ]);
  return ok({
    notifications: { items, unread },
    chat: { unread: chatUnread, latest: chatLatest },
  });
});
