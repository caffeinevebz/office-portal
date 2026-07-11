import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { ensureSystemRoles } from "@/lib/auth/ensure-roles";
import { SYSTEM_ROLES } from "@/lib/auth/roles";

// Role names for populating dropdowns (any signed-in user).
export const GET = route(async () => {
  await requireUser();
  await ensureSystemRoles(prisma);
  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { name: true },
  });
  const names = roles.map((r) => r.name);
  // Defensive: guarantee the system roles are present even before seeding.
  for (const s of SYSTEM_ROLES) if (!names.includes(s)) names.push(s);
  return ok(names);
});
