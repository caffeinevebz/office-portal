import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { clientGroupSchema } from "@/lib/validation";

export const GET = route(async () => {
  await requireUser();
  const groups = await prisma.clientGroup.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { clients: true } } },
  });
  return ok(groups);
});

export const POST = route(async (req) => {
  await requirePermission("manageClients");
  const data = await parse(req, clientGroupSchema);
  const code = data.code.toUpperCase();
  if (await prisma.clientGroup.findUnique({ where: { code } })) {
    return fail(`A group with code ${code} already exists`);
  }
  const group = await prisma.clientGroup.create({ data: { ...data, code } });
  return ok(group, 201);
});
