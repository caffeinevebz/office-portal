import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { packetUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInward");
  const { id } = await ctx.params;
  const data = await parse(req, packetUpdateSchema);
  // receivedAt: only overwrite when a date was actually supplied.
  const { receivedAt, items, ...rest } = data;
  const patch: Record<string, unknown> = { ...rest };
  if (items !== undefined) {
    // The edit form passes each item's returned metadata through untouched,
    // so renaming/adding documents never loses the return history.
    patch.items = items.map((i) => ({
      name: i.name,
      returned: i.returned ?? false,
      ...(i.returnedOn ? { returnedOn: i.returnedOn } : {}),
      ...(i.outwardNumber ? { outwardNumber: i.outwardNumber } : {}),
    }));
    // Keep the summary in step with the list unless one was typed explicitly.
    if (data.contents === undefined || data.contents === null) {
      patch.contents = items.map((i) => i.name).join(", ");
    }
  }
  const packet = await prisma.docPacket.update({
    where: { id },
    data: { ...patch, ...(receivedAt ? { receivedAt } : {}) },
    include: { client: true, movements: { orderBy: { createdAt: "desc" } } },
  });
  return ok(packet);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("deleteInward");
  const { id } = await ctx.params;
  await prisma.docPacket.delete({ where: { id } }); // movements cascade
  return ok({ ok: true });
});
