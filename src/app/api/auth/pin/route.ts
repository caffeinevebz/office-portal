import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

// Manage the signed-in member's quick-access PIN.

export const GET = route(async () => {
  const user = await requireUser();
  const row = await prisma.staff.findUnique({
    where: { id: user.id },
    select: { pinHash: true },
  });
  return ok({ hasPin: Boolean(row?.pinHash) });
});

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/, "The PIN must be exactly 4 digits"),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { pin } = await parse(req, schema);
  await prisma.staff.update({
    where: { id: user.id },
    data: { pinHash: hashPassword(pin), pinFailedCount: 0 },
  });
  return ok({ hasPin: true });
});

export const DELETE = route(async () => {
  const user = await requireUser();
  await prisma.staff.update({
    where: { id: user.id },
    data: { pinHash: null, pinFailedCount: 0 },
  });
  return ok({ hasPin: false });
});
