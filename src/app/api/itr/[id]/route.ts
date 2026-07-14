import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { itrUpdateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

async function applyUpdate(id: string, data: Prisma.ItrFilingUncheckedUpdateInput) {
  const patch: Prisma.ItrFilingUncheckedUpdateInput = { ...data };
  // Stamp the filing date when a return first moves to a filed-or-later state.
  if (typeof data.status === "string") {
    const filedStates = ["Filed", "E-Verified", "Processed"];
    if (filedStates.includes(data.status)) {
      const current = await prisma.itrFiling.findUnique({ where: { id } });
      if (current && !current.filedOn && data.filedOn === undefined) {
        patch.filedOn = new Date();
      }
    }
  }
  return prisma.itrFiling.update({
    where: { id },
    data: patch,
    include: { client: true, assignee: true, task: { select: { id: true, title: true } } },
  });
}

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageItr");
  const { id } = await ctx.params;
  const data = await parse(req, itrUpdateSchema);
  const filing = await applyUpdate(id, data as Prisma.ItrFilingUncheckedUpdateInput);
  return ok(filing);
});

// Quick status change from the register table.
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageItr");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status) return fail("status is required");
  const filing = await applyUpdate(id, { status: body.status });
  return ok(filing);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("deleteItr");
  const { id } = await ctx.params;
  await prisma.itrFiling.delete({ where: { id } });
  return ok({ ok: true });
});
