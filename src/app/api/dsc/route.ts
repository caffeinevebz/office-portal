import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { dscCreateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const custody = searchParams.get("custody")?.trim();

  const where: Prisma.DscWhereInput = {};
  if (custody && custody !== "All") where.custody = custody;
  if (q) {
    where.OR = [
      { holderName: { contains: q, mode: "insensitive" } },
      { serialNumber: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const dscs = await prisma.dsc.findMany({
    where,
    orderBy: { expiryDate: "asc" },
    include: {
      client: true,
      movements: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  return ok(dscs);
});

export const POST = route(async (req) => {
  await requirePermission("manageDsc");
  const data = await parse(req, dscCreateSchema);
  const dsc = await prisma.dsc.create({
    data,
    include: { client: true, movements: true },
  });
  return ok(dsc, 201);
});
