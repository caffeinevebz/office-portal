import type { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLES, ROLE_ACCESS } from "./roles";

// Make sure the built-in roles exist as Role rows. Called from the seed and
// from first-run setup. Plain (not server-only) so the tsx seed can use it too.
export async function ensureSystemRoles(prisma: PrismaClient) {
  for (const name of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: ROLE_ACCESS[name] ?? null, isSystem: true },
    });
  }
}
