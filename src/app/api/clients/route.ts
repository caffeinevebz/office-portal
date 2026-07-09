import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { clientCreateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim();

  const where: Prisma.ClientWhereInput = {};
  if (status && status !== "All") where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { pan: { contains: q } },
      { gstin: { contains: q } },
      { contactPerson: { contains: q } },
    ];
  }

  const clients = await prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          tasks: { where: { status: { not: "Completed" } } },
          invoices: true,
          documents: true,
        },
      },
    },
  });
  return ok(clients);
});

export const POST = route(async (req) => {
  const data = await parse(req, clientCreateSchema);
  const client = await prisma.client.create({ data });
  return ok(client, 201);
});
