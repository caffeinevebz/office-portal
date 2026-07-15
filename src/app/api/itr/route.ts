import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { itrCreateSchema } from "@/lib/validation";
import { mirrorFilingToTask } from "@/lib/filing";
import type { Prisma } from "@prisma/client";

// One-time backfill: derive financialYear from the legacy assessmentYear
// (AY start − 1). Cheap no-op once every row has a financialYear.
async function backfillFinancialYears() {
  const legacy = await prisma.itrFiling.findMany({
    where: { financialYear: null, assessmentYear: { not: null } },
    select: { id: true, assessmentYear: true },
  });
  for (const r of legacy) {
    const ayStart = parseInt((r.assessmentYear ?? "").slice(0, 4), 10);
    if (Number.isNaN(ayStart)) continue;
    const fyStart = ayStart - 1;
    await prisma.itrFiling.update({
      where: { id: r.id },
      data: { financialYear: `${fyStart}-${String(fyStart + 1).slice(2)}` },
    });
  }
}

export const GET = route(async (req) => {
  await requireUser();
  await backfillFinancialYears();
  const { searchParams } = new URL(req.url);
  const fy = searchParams.get("fy")?.trim();
  const type = searchParams.get("type")?.trim();
  const status = searchParams.get("status")?.trim();
  const q = searchParams.get("q")?.trim();

  const where: Prisma.ItrFilingWhereInput = {};
  if (fy && fy !== "All") where.financialYear = fy;
  if (type && type !== "All") where.returnType = type;
  if (status && status !== "All") where.status = status;
  if (q) {
    where.OR = [
      { client: { name: { contains: q, mode: "insensitive" } } },
      { client: { pan: { contains: q, mode: "insensitive" } } },
      { ackNumber: { contains: q, mode: "insensitive" } },
      { formType: { contains: q, mode: "insensitive" } },
    ];
  }

  const filings = await prisma.itrFiling.findMany({
    where,
    orderBy: [{ financialYear: "desc" }, { createdAt: "asc" }],
    include: { client: true, assignee: true, task: { select: { id: true, title: true } } },
  });
  return ok(filings);
});

export const POST = route(async (req) => {
  await requirePermission("manageItr");
  const data = await parse(req, itrCreateSchema);
  // A task can be linked to at most one filing entry.
  if (data.taskId) {
    const dup = await prisma.itrFiling.findUnique({ where: { taskId: data.taskId } });
    if (dup) return fail("That task is already linked to another filing entry.", 409);
  }
  const filing = await prisma.itrFiling.create({
    data,
    include: { client: true, assignee: true, task: { select: { id: true, title: true } } },
  });
  await mirrorFilingToTask(filing);
  return ok(filing, 201);
});
