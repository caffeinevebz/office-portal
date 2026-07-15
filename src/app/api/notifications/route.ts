import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

// The signed-in member's latest notifications + unread count. Polled by the
// header bell, so keep it lean.
export const GET = route(async () => {
  const user = await requireUser();
  const [items, unread] = await Promise.all([
    prisma.appNotification.findMany({
      where: { staffId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.appNotification.count({ where: { staffId: user.id, readAt: null } }),
  ]);
  return ok({ items, unread });
});

// Mark notifications read: specific ids, or all of the member's when none given.
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  await prisma.appNotification.updateMany({
    where: {
      staffId: user.id,
      readAt: null,
      ...(body.ids && body.ids.length ? { id: { in: body.ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return ok({ ok: true });
});
