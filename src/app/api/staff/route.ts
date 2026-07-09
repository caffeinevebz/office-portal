import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { staffCreateSchema } from "@/lib/validation";

export const GET = route(async () => {
  const staff = await prisma.staff.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { tasks: { where: { status: { not: "Completed" } } } },
      },
    },
  });
  return ok(staff);
});

export const POST = route(async (req) => {
  const data = await parse(req, staffCreateSchema);
  const member = await prisma.staff.create({ data });
  return ok(member, 201);
});
