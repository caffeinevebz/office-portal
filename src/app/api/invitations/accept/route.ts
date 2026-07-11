import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { invitationAcceptSchema } from "@/lib/validation";
import { getDefaultOrg } from "@/lib/org";
import { FIRM } from "@/lib/firm";

async function loadValid(token: string) {
  const invite = await prisma.invitation.findUnique({ where: { token } });
  if (!invite || invite.status !== "Pending" || invite.expiresAt < new Date()) return null;
  return invite;
}

// Public: describe an invitation so the accept page can render.
export const GET = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const invite = await loadValid(token);
  const org = await getDefaultOrg();
  if (!invite) return ok({ valid: false, firmName: org?.name ?? FIRM.name });
  const taken = !!(await prisma.staff.findUnique({ where: { email: invite.email } }));
  return ok({
    valid: !taken,
    firmName: org?.name ?? FIRM.name,
    email: invite.email,
    name: invite.name,
    role: invite.role,
  });
});

// Public: accept an invitation by setting a password → creates the staff account.
export const POST = route(async (req) => {
  const data = await parse(req, invitationAcceptSchema);
  const invite = await loadValid(data.token);
  if (!invite) return fail("This invitation is invalid or has expired", 410);
  if (await prisma.staff.findUnique({ where: { email: invite.email } })) {
    return fail("An account for this email already exists", 409);
  }

  await prisma.$transaction([
    prisma.staff.create({
      data: {
        name: data.name,
        email: invite.email,
        role: invite.role,
        passwordHash: hashPassword(data.password),
        active: true,
      },
    }),
    prisma.invitation.update({
      where: { id: invite.id },
      data: { status: "Accepted", acceptedAt: new Date() },
    }),
  ]);
  return ok({ ok: true });
});
