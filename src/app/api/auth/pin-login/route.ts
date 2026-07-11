import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.string().trim().min(1),
  pin: z.string().regex(/^\d{4}$/),
});

// Public: quick sign-in with email + 4-digit PIN. Five wrong attempts lock
// the PIN until the member signs in with their password again.
export const POST = route(async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Email and a 4-digit PIN are required");

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.staff.findUnique({ where: { email } });

  if (!user || !user.active || !user.pinHash) {
    return fail("PIN sign-in is not set up for this account", 401);
  }
  if (user.pinFailedCount >= MAX_ATTEMPTS) {
    return fail("PIN locked after too many attempts — sign in with your password", 423);
  }

  if (!verifyPassword(parsed.data.pin, user.pinHash)) {
    const updated = await prisma.staff.update({
      where: { id: user.id },
      data: { pinFailedCount: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - updated.pinFailedCount;
    return fail(
      left > 0
        ? `Wrong PIN — ${left} attempt${left === 1 ? "" : "s"} left`
        : "PIN locked after too many attempts — sign in with your password",
      401,
    );
  }

  await prisma.staff.update({ where: { id: user.id }, data: { pinFailedCount: 0 } });
  await createSession(user.id);
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
});
