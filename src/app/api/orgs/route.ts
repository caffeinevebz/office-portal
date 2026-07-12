import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { organizationSchema } from "@/lib/validation";

// Logo bytes are excluded from list payloads; hasLogo flags their presence.
const LIST_SELECT = {
  id: true, name: true, tagline: true, address: true, phone: true, email: true,
  pan: true, gstin: true, sacCode: true, bankName: true, bankAccount: true,
  bankIfsc: true, bankUpi: true, invoiceNote: true, invoicePrefix: true, isDefault: true,
  logoMime: true, createdAt: true,
  _count: { select: { invoices: true } },
} as const;

export const GET = route(async () => {
  await requireUser();
  const orgs = await prisma.organization.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: LIST_SELECT,
  });
  return ok(orgs.map((o) => ({ ...o, hasLogo: !!o.logoMime })));
});

export const POST = route(async (req) => {
  await requirePermission("manageOrgs");
  const data = await parse(req, organizationSchema);
  const count = await prisma.organization.count();
  const org = await prisma.organization.create({
    data: { ...data, isDefault: count === 0 }, // the first org becomes default
    select: LIST_SELECT,
  });
  return ok({ ...org, hasLogo: !!org.logoMime }, 201);
});
