import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

export const GET = route(async () => {
  await requireUser();
  const logs = await prisma.notificationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(logs);
});
