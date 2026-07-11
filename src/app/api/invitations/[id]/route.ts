import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

// Revoke a pending invitation.
export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageTeam");
  const { id } = await ctx.params;
  await prisma.invitation.update({
    where: { id },
    data: { status: "Revoked" },
  });
  return ok({ ok: true });
});
