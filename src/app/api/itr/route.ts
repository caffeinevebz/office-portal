import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { itrCreateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const ay = searchParams.get("ay")?.trim();
  const status = searchParams.get("status")?.trim();
  const q = searchParams.get("q")?.trim();

  const where: Prisma.ItrFilingWhereInput = {};
  if (ay && ay !== "All") where.assessmentYear = ay;
  if (status && status !== "All") where.status = status;
  if (q) {
    where.OR = [
      { client: { name: { contains: q, mode: "insensitive" } } },
      { client: { pan: { contains: q, mode: "insensitive" } } },
      { ackNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  const filings = await prisma.itrFiling.findMany({
    where,
    orderBy: [{ assessmentYear: "desc" }, { createdAt: "asc" }],
    include: { client: true, assignee: true },
  });
  return ok(filings);
});

export const POST = route(async (req) => {
  await requirePermission("manageItr");
  const data = await parse(req, itrCreateSchema);
  const filing = await prisma.itrFiling.create({
    data,
    include: { client: true, assignee: true },
  });
  return ok(filing, 201);
});
