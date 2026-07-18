import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { packetMovementSchema } from "@/lib/validation";
import { nextOutwardNumber } from "@/lib/regnumber";

type Ctx = { params: Promise<{ id: string }> };

type PacketItem = {
  name: string;
  returned: boolean;
  returnedOn?: string | null;
  outwardNumber?: string | null;
};

// Record a packet movement: "Out" = documents returned/dispatched to the
// client (gets an outward number), "In" = documents received back. When the
// packet's documents were entered as a list, the movement covers a selection
// from that list — returning some documents ticks just those off, and the
// packet counts as Returned only once every document is back with the client.
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("manageInward");
  const { id } = await ctx.params;
  const data = await parse(req, packetMovementSchema);

  const packet = await prisma.docPacket.findUnique({ where: { id } });
  if (!packet) return fail("Inward entry not found", 404);

  const items = (packet.items as PacketItem[] | null) ?? null;

  let movedNames: string[] | null = null;
  let newItems: PacketItem[] | null = null;
  let newStatus: string;
  const outwardNumber = data.direction === "Out" ? await nextOutwardNumber() : null;
  const today = new Date().toISOString().slice(0, 10);

  if (items && items.length > 0) {
    // Itemised packet: the movement applies to eligible items — unreturned
    // ones going Out, returned ones coming back In.
    const eligible = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => (data.direction === "Out" ? !it.returned : it.returned));
    if (eligible.length === 0) {
      return fail(
        data.direction === "Out"
          ? "Every document in this packet has already been returned"
          : "No documents from this packet are out with the client",
      );
    }
    // Selection from the entered list; omitted = all eligible documents.
    const chosen = data.itemIndexes
      ? eligible.filter(({ idx }) => data.itemIndexes!.includes(idx))
      : eligible;
    if (chosen.length === 0) {
      return fail("Select at least one document for this movement");
    }
    const chosenIdx = new Set(chosen.map(({ idx }) => idx));
    newItems = items.map((it, idx) =>
      chosenIdx.has(idx)
        ? data.direction === "Out"
          ? { ...it, returned: true, returnedOn: today, outwardNumber }
          : { name: it.name, returned: false }
        : it,
    );
    movedNames = chosen.map(({ it }) => it.name);
    newStatus = newItems.every((it) => it.returned) ? "Returned" : "In Custody";
  } else {
    // Legacy whole-packet behaviour (no item list recorded).
    if (data.direction === "Out" && packet.status === "Returned") {
      return fail("This packet has already been returned");
    }
    if (data.direction === "In" && packet.status === "In Custody") {
      return fail("This packet is already in the firm's custody");
    }
    newStatus = data.direction === "Out" ? "Returned" : "In Custody";
  }

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
        items: movedNames ?? undefined,
        byName: user.name,
      },
    }),
    prisma.docPacket.update({
      where: { id },
      data: { status: newStatus, ...(newItems ? { items: newItems } : {}) },
      include: { client: true, movements: { orderBy: { createdAt: "desc" } } },
    }),
  ]);
  return ok(updated);
});
