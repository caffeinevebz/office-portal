import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { staffCreateSchema } from "@/lib/validation";

export const GET = route(async () => {
  await requireUser();
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
  await requirePermission("manageTeam");
  const { password, ...data } = await parse(req, staffCreateSchema);
  const member = await prisma.staff.create({
    data: {
      ...data,
      email: data.email.toLowerCase(),
      passwordHash: password ? hashPassword(password) : null,
    },
  });
  return ok(member, 201);
});
