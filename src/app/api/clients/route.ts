import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { clientCreateSchema } from "@/lib/validation";
import { gstRegistrationData } from "@/lib/gst";
import { findClientDuplicate, duplicateMessage } from "@/lib/clients";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim();
  // Picker pages ask for the slim shape: scalars + GST registrations, no
  // per-row counts or trade-name joins — a much cheaper query and payload.
  const slim = searchParams.get("slim") === "1";

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
      { gstRegistrations: { some: { gstin: { contains: q, mode: "insensitive" } } } },
    ];
  }

  if (slim) {
    const clients = await prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        group: { select: { id: true, code: true, name: true } },
        gstRegistrations: { orderBy: { createdAt: "asc" } },
      },
    });
    return ok(clients);
  }

  const clients = await prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      group: true,
      tradeNames: { orderBy: { name: "asc" } },
      gstRegistrations: { orderBy: { createdAt: "asc" } },
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
  const { tradeNames, gstRegistrations, ...data } = await parse(req, clientCreateSchema);
  // No duplicate client records: PAN identifies a client; without one, an
  // exact name match is treated as the same client.
  const dup = await findClientDuplicate({ pan: data.pan, name: data.name });
  if (dup) return fail(duplicateMessage(dup), 409);
  const client = await prisma.client.create({
    data: {
      ...data,
      tradeNames:
        tradeNames && tradeNames.length
          ? { create: tradeNames.map(({ id: _id, ...t }) => t) }
          : undefined,
      gstRegistrations:
        gstRegistrations && gstRegistrations.length
          ? { create: gstRegistrations.map(({ id: _id, ...g }) => gstRegistrationData(g)) }
          : undefined,
    },
    include: {
      group: true,
      tradeNames: { orderBy: { name: "asc" } },
      gstRegistrations: { orderBy: { createdAt: "asc" } },
    },
  });
  return ok(client, 201);
});
