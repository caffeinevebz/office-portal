import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { packetCreateSchema } from "@/lib/validation";
import { nextInwardNumber } from "@/lib/regnumber";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim();

  const where: Prisma.DocPacketWhereInput = {};
  if (status && status !== "All") where.status = status;
  if (q) {
    where.OR = [
      { inwardNumber: { contains: q, mode: "insensitive" } },
      { receivedFrom: { contains: q, mode: "insensitive" } },
      { contents: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const packets = await prisma.docPacket.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    include: {
      client: true,
      movements: { orderBy: { createdAt: "desc" } },
    },
  });
  return ok(packets);
});

export const POST = route(async (req) => {
  const user = await requirePermission("manageInward");
  const data = await parse(req, packetCreateSchema);
  // Documents come in as a list; the contents summary derives from it.
  if (!data.contents && !(data.items && data.items.length)) {
    return fail("List the documents received (or describe the contents)");
  }
  const contents = data.contents ?? data.items!.map((i) => i.name).join(", ");
  const packet = await prisma.docPacket.create({
    data: {
      ...data,
      contents,
      // Fresh entries start with nothing returned.
      items: data.items?.map((i) => ({ name: i.name, returned: false })),
      receivedAt: data.receivedAt ?? new Date(),
      inwardNumber: await nextInwardNumber(),
      receivedByName: user.name,
    },
    include: { client: true, movements: true },
  });
  return ok(packet, 201);
});
