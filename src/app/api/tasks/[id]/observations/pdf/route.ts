import { prisma } from "@/lib/prisma";
import { fail, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDefaultOrg } from "@/lib/org";
import { buildObservationsPdf, observationsFilename } from "@/lib/pdf/audit-notes";
import { pdfResponse } from "@/lib/pdf/document";
import { OBSERVATION_KINDS, VOUCHING_AREAS, UNFILED_VOUCHING } from "@/lib/audit-notes";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The working paper as a printable sheet — everything the panel shows, on the
 * firm's letterhead, filed area-wise.
 *
 * `kind` and `area` narrow it to what the auditor is looking at on screen, so
 * printing what you can see gives you what you can see. Anything unrecognised
 * is ignored rather than refused: a stale bookmark should still print the file.
 */
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind")?.trim();
  const area = searchParams.get("area")?.trim();
  const wantKind = kind && (OBSERVATION_KINDS as readonly string[]).includes(kind) ? kind : null;
  // "Area not stated" is a real thing to print — the points still waiting to be
  // filed under an area — so it is accepted alongside the named areas.
  const unfiled = area === UNFILED_VOUCHING;
  const wantArea = area && (VOUCHING_AREAS as readonly string[]).includes(area) ? area : null;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      title: true,
      taskType: true,
      financialYear: true,
      client: { select: { name: true } },
    },
  });
  if (!task) return fail("Task not found", 404);

  const rows = await prisma.auditObservation.findMany({
    where: {
      taskId: id,
      ...(wantKind ? { kind: wantKind } : {}),
      // An area only narrows the vouching; asking for one alongside the
      // scrutiny notes would return nothing at all.
      ...(wantArea ? { kind: "Vouching", vouchingArea: wantArea } : {}),
      ...(unfiled ? { kind: "Vouching", vouchingArea: null } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      kind: true,
      vouchingArea: true,
      observation: true,
      internalNote: true,
      ledgerName: true,
      voucherNo: true,
      voucherDate: true,
      partyName: true,
      amount: true,
      needsClarification: true,
      status: true,
      response: true,
      respondedAt: true,
      resolution: true,
      raisedBy: true,
      createdAt: true,
      letter: { select: { number: true, status: true, issuedAt: true } },
    },
  });

  const bytes = await buildObservationsPdf({
    client: task.client,
    task: { title: task.title, taskType: task.taskType, financialYear: task.financialYear },
    organization: await getDefaultOrg(),
    rows,
    printedBy: user.name,
    filter: { kind: wantKind, area: wantArea ?? (unfiled ? UNFILED_VOUCHING : null) },
  });

  return pdfResponse({
    bytes,
    filename: observationsFilename(task.client?.name ?? null, task),
    title: `Audit observations — ${task.title}`,
  });
});
