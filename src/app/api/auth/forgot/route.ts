import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { getDefaultOrg } from "@/lib/org";
import { deliver } from "@/lib/notify";
import { APP_NAME } from "@/lib/constants";

const RESET_TTL_MINUTES = 60;

const schema = z.object({ email: z.string().trim().email("Valid email required") });

// Public: request a password-reset link. Always responds identically whether
// or not the email belongs to a team member, to avoid account enumeration.
export const POST = route(async (req) => {
  const { email } = await parse(req, schema);
  const staff = await prisma.staff.findUnique({ where: { email: email.toLowerCase() } });

  if (staff && staff.active) {
    // A fresh request invalidates any earlier unused links.
    await prisma.passwordReset.deleteMany({
      where: { staffId: staff.id, usedAt: null },
    });
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
    await prisma.passwordReset.create({ data: { staffId: staff.id, token, expiresAt } });

    const org = await getDefaultOrg();
    const firm = org?.name ?? APP_NAME;
    const link = `${new URL(req.url).origin}/reset/${token}`;
    const subject = `Reset your ${firm} portal password`;
    const body = `Hello ${staff.name},\n\nA password reset was requested for your ${APP_NAME} account at ${firm}.\n\nSet a new password here (link valid ${RESET_TTL_MINUTES} minutes):\n${link}\n\nIf you didn't request this, you can safely ignore this email — your password is unchanged.`;
    const status = await deliver("Email", staff.email, subject, body);

    // Keep a copy in the notification log so an admin can share the link
    // manually while email delivery is still in simulated mode.
    await prisma.notificationLog.create({
      data: {
        channel: "Email",
        recipientType: "Staff",
        recipientName: staff.name,
        to: staff.email,
        subject,
        body,
        status,
        dedupeKey: `password-reset:${staff.id}:${Date.now()}`,
      },
    });
  }

  return ok({
    ok: true,
    message:
      "If that email belongs to a team member, a reset link has been sent. It is valid for 60 minutes.",
  });
});
