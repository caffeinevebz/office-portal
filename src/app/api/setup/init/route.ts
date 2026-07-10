import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { seedDemoData } from "@/lib/seed-data";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("demo") }),
  z.object({
    mode: z.literal("fresh"),
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
]);

// One-time initialisation, callable from the browser on a fresh deployment.
// Refuses to run once any staff account exists, so it cannot be used to wipe
// or take over a live portal.
export const POST = route(async (req) => {
  const staffCount = await prisma.staff.count();
  if (staffCount > 0) {
    return fail("The portal is already initialised", 403);
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join(", "));
  }

  if (parsed.data.mode === "demo") {
    const counts = await seedDemoData(prisma);
    return ok({ mode: "demo", counts }, 201);
  }

  const { name, email, password } = parsed.data;
  await prisma.reminderSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  await prisma.staff.create({
    data: {
      name,
      email: email.toLowerCase(),
      role: "Partner",
      passwordHash: hashPassword(password),
    },
  });
  return ok({ mode: "fresh" }, 201);
});
