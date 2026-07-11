import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { invitationCreateSchema } from "@/lib/validation";
import { getDefaultOrg } from "@/lib/org";
import { deliver, providerStatus } from "@/lib/notify";
import { FIRM } from "@/lib/firm";

const INVITE_TTL_DAYS = 7;

export const GET = route(async () => {
  await requirePermission("manageTeam");
  const invites = await prisma.invitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(
    invites.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      role: i.role,
      status: i.status,
      invitedBy: i.invitedBy,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      expired: i.status === "Pending" && i.expiresAt < new Date(),
    })),
  );
});

export const POST = route(async (req) => {
  const user = await requirePermission("manageTeam");
  const data = await parse(req, invitationCreateSchema);
  const email = data.email.toLowerCase();

  if (await prisma.staff.findUnique({ where: { email } })) {
    return fail("Someone with that email is already on the team");
  }
  // Replace any prior pending invite for this email.
  await prisma.invitation.deleteMany({ where: { email, status: "Pending" } });

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  const invite = await prisma.invitation.create({
    data: { email, name: data.name, role: data.role, token, invitedBy: user.name, expiresAt },
  });

  const org = await getDefaultOrg();
  const firmName = org?.name ?? FIRM.name;
  const link = `${new URL(req.url).origin}/invite/${token}`;
  const subject = `You're invited to join ${firmName} on the office portal`;
  const body = `Hello${data.name ? " " + data.name : ""},\n\n${user.name} has invited you to join ${firmName} as ${data.role} on the office portal.\n\nSet your password and activate your account here (link valid ${INVITE_TTL_DAYS} days):\n${link}\n\nIf you weren't expecting this, you can ignore this email.`;
  const status = await deliver("Email", email, subject, body);

  return ok({ invite: { id: invite.id, email, role: data.role }, link, delivery: status, provider: await providerStatus() }, 201);
});
