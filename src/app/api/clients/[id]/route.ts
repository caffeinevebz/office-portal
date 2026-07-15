import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { clientUpdateSchema } from "@/lib/validation";
import { gstRegistrationData } from "@/lib/gst";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        include: { assignee: true },
      },
      invoices: { orderBy: { issueDate: "desc" }, include: { tradeName: true } },
      documents: { orderBy: { uploadedAt: "desc" } },
      tradeNames: { orderBy: { name: "asc" } },
      gstRegistrations: { orderBy: { createdAt: "asc" } },
      group: true,
    },
  });
  if (!client) return fail("Client not found", 404);
  return ok(client);
});

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageClients");
  const { id } = await ctx.params;
  const { tradeNames, gstRegistrations, ...data } = await parse(req, clientUpdateSchema);
  await prisma.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data });
    // When the form sends a trade-name list, sync to it: update by id, create
    // new ones, and remove any the user deleted (invoices keep, link nulled).
    if (tradeNames) {
      const existing = await tx.tradeName.findMany({ where: { clientId: id }, select: { id: true } });
      const keep = new Set(tradeNames.filter((t) => t.id).map((t) => t.id));
      const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (remove.length) await tx.tradeName.deleteMany({ where: { id: { in: remove } } });
      for (const { id: tid, ...fields } of tradeNames) {
        if (tid) await tx.tradeName.update({ where: { id: tid }, data: fields });
        else await tx.tradeName.create({ data: { ...fields, clientId: id } });
      }
    }
    // Same sync for GST registrations. Removing one nulls the link on any
    // task / filing entry that used it (onDelete: SetNull).
    if (gstRegistrations) {
      const existing = await tx.gstRegistration.findMany({ where: { clientId: id }, select: { id: true } });
      const keep = new Set(gstRegistrations.filter((g) => g.id).map((g) => g.id));
      const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (remove.length) await tx.gstRegistration.deleteMany({ where: { id: { in: remove } } });
      for (const { id: gid, ...fields } of gstRegistrations) {
        const values = gstRegistrationData(fields);
        if (gid) await tx.gstRegistration.update({ where: { id: gid }, data: values });
        else await tx.gstRegistration.create({ data: { ...values, clientId: id } });
      }
    }
  });
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      group: true,
      tradeNames: { orderBy: { name: "asc" } },
      gstRegistrations: { orderBy: { createdAt: "asc" } },
    },
  });
  return ok(client);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("deleteClients");
  const { id } = await ctx.params;
  await prisma.client.delete({ where: { id } });
  return ok({ ok: true });
});
