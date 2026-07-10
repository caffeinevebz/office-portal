import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { packetMovementSchema } from "@/lib/validation";
import { nextOutwardNumber } from "@/lib/regnumber";

type Ctx = { params: Promise<{ id: string }> };

// Record a packet movement: "Out" = documents returned/dispatched to the
// client (gets an outward number), "In" = the same packet received back.
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("manageInward");
  const { id } = await ctx.params;
  const data = await parse(req, packetMovementSchema);

  const packet = await prisma.docPacket.findUnique({ where: { id } });
  if (!packet) return fail("Inward entry not found", 404);

  if (data.direction === "Out" && packet.status === "Returned") {
    return fail("This packet has already been returned");
  }
  if (data.direction === "In" && packet.status === "In Custody") {
    return fail("This packet is already in the firm's custody");
  }

  const outwardNumber = data.direction === "Out" ? await nextOutwardNumber() : null;

  const [, updated] = await prisma.$transaction([
    prisma.packetMovement.create({
      data: {
        packetId: id,
        direction: data.direction,
        outwardNumber,
        person: data.person,
        mode: data.mode,
        courierRef: data.courierRef,
        note: data.note,
        byName: user.name,
      },
    }),
    prisma.docPacket.update({
      where: { id },
      data: { status: data.direction === "Out" ? "Returned" : "In Custody" },
      include: { client: true, movements: { orderBy: { createdAt: "desc" } } },
    }),
  ]);
  return ok(updated);
});
