import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { getDefaultOrg } from "@/lib/org";

async function findValid(token: string) {
  const reset = await prisma.passwordReset.findUnique({ where: { token } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return null;
  const staff = await prisma.staff.findUnique({ where: { id: reset.staffId } });
  if (!staff || !staff.active) return null;
  return { reset, staff };
}

// Public: check a reset link before showing the form.
export const GET = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  const hit = token ? await findValid(token) : null;
  const org = await getDefaultOrg().catch(() => null);
  if (!hit) return ok({ valid: false, firmName: org?.name ?? null });
  return ok({
    valid: true,
    firmName: org?.name ?? null,
    name: hit.staff.name,
    email: hit.staff.email,
  });
});

const schema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Public: set the new password using a valid, unused, unexpired link.
export const POST = route(async (req) => {
  const { token, password } = await parse(req, schema);
  const hit = await findValid(token);
  if (!hit) return fail("This reset link is invalid or has expired. Request a new one.", 400);

  await prisma.$transaction([
    prisma.staff.update({
      where: { id: hit.staff.id },
      data: { passwordHash: hashPassword(password) },
    }),
    prisma.passwordReset.update({
      where: { id: hit.reset.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return ok({ ok: true });
});
