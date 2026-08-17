import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/effective";
import type { Prisma } from "@prisma/client";

// Every audit engagement with the state of its working paper, so the auditor
// can reach the notes without first finding the task they hang off.
//
// The counts come back with the list rather than on opening each panel: what
// an auditor is looking for is *which* engagement has points still waiting on
// the client, and that only reads as an answer if every row carries it.

export const GET = route(async (req) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const fy = searchParams.get("fy")?.trim();

  const and: Prisma.TaskWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { taskType: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  // The same rule the task register runs on: staff-level members see the work
  // that is theirs, and a working paper is no more open than its engagement.
  if (!(await roleHasPermission(user.role, "viewAllTasks"))) {
    and.push({
      OR: [
        { assigneeId: user.id },
        { assignees: { some: { id: user.id } } },
        { approverId: user.id },
      ],
    });
  }

  const tasks = await prisma.task.findMany({
    where: {
      category: "Audit",
      ...(fy && fy !== "All" ? { financialYear: fy } : {}),
      ...(and.length ? { AND: and } : {}),
    },
    orderBy: [{ dueDate: "asc" }],
    select: {
      id: true,
      title: true,
      taskType: true,
      financialYear: true,
      status: true,
      dueDate: true,
      client: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
  if (tasks.length === 0) return ok([]);

  const ids = tasks.map((t) => t.id);
  // One pass over the notes, grouped by everything the row needs to say.
  const [buckets, latest, letters] = await Promise.all([
    prisma.auditObservation.groupBy({
      by: ["taskId", "kind", "status", "needsClarification"],
      where: { taskId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.auditObservation.groupBy({
      by: ["taskId"],
      where: { taskId: { in: ids } },
      _max: { createdAt: true },
    }),
    prisma.queryLetter.groupBy({
      by: ["taskId", "status"],
      where: { taskId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const zero = () => ({
    notes: 0,
    vouching: 0,
    scrutiny: 0,
    needsClarification: 0,
    queried: 0,
    answered: 0,
    settled: 0,
    letters: 0,
    lettersOut: 0,
  });
  const counts = new Map(ids.map((id) => [id, zero()]));
  for (const b of buckets) {
    const c = counts.get(b.taskId);
    if (!c) continue;
    const n = b._count._all;
    c.notes += n;
    if (b.kind === "Vouching") c.vouching += n;
    else c.scrutiny += n;
    if (b.needsClarification) c.needsClarification += n;
    if (b.status === "Queried") c.queried += n;
    if (b.status === "Answered") c.answered += n;
    if (b.status === "Closed" || b.status === "Dropped") c.settled += n;
  }
  for (const l of letters) {
    const c = l.taskId ? counts.get(l.taskId) : null;
    if (!c) continue;
    c.letters += l._count._all;
    // A letter that has gone is what the client is actually answering.
    if (l.status === "Sent" || l.status === "Replied") c.lettersOut += l._count._all;
  }
  const lastNote = new Map(latest.map((l) => [l.taskId, l._max.createdAt]));

  const rows = tasks.map((t) => ({
    ...t,
    counts: counts.get(t.id) ?? zero(),
    lastNoteAt: lastNote.get(t.id) ?? null,
  }));

  // An engagement with points out with the client comes first — that is the
  // one somebody is waiting on. Then the ones being written up, then the rest.
  const rank = (r: (typeof rows)[number]) =>
    r.counts.queried > 0 ? 0 : r.counts.notes > 0 ? 1 : 2;
  rows.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const at = a.lastNoteAt?.getTime() ?? 0;
    const bt = b.lastNoteAt?.getTime() ?? 0;
    if (at !== bt) return bt - at;
    return (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
  });

  return ok(rows);
});
