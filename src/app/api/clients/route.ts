import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { clientCreateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim();

  const groupId = searchParams.get("groupId")?.trim();

  const where: Prisma.ClientWhereInput = {};
  if (status && status !== "All") where.status = status;
  if (groupId && groupId !== "All") where.groupId = groupId === "None" ? null : groupId;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { pan: { contains: q, mode: "insensitive" } },
      { gstin: { contains: q, mode: "insensitive" } },
      { tan: { contains: q, mode: "insensitive" } },
      { contactPerson: { contains: q, mode: "insensitive" } },
      { tradeNames: { some: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const clients = await prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      group: true,
      tradeNames: { orderBy: { name: "asc" } },
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
  await requirePermission("manageClients");
  const data = await parse(req, clientCreateSchema);
  const client = await prisma.client.create({ data });
  return ok(client, 201);
});
