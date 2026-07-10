import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { documentCreateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category")?.trim();
  const clientId = searchParams.get("clientId")?.trim();
  const q = searchParams.get("q")?.trim();

  const where: Prisma.DocumentWhereInput = {};
  if (category && category !== "All") where.category = category;
  if (clientId) where.clientId = clientId;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const documents = await prisma.document.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
    include: { client: true },
  });
  return ok(documents);
});

export const POST = route(async (req) => {
  await requirePermission("manageDocuments");
  const data = await parse(req, documentCreateSchema);
  const doc = await prisma.document.create({
    data,
    include: { client: true },
  });
  return ok(doc, 201);
});
