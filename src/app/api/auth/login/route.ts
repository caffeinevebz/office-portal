import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const schema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export const POST = route(async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Email and password are required");

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.staff.findUnique({ where: { email } });

  if (!user || !user.active || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return fail("Invalid email or password", 401);
  }

  // A successful password sign-in unlocks a PIN locked by failed attempts.
  if (user.pinFailedCount > 0) {
    await prisma.staff.update({ where: { id: user.id }, data: { pinFailedCount: 0 } });
  }

  await createSession(user.id);
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
});
