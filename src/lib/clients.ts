import "server-only";
import { prisma } from "@/lib/prisma";

export type DuplicateHit = {
  kind: "pan" | "name";
  client: { id: string; name: string; pan: string | null };
};

/**
 * Duplicate-client check. PAN is the identity: a second record with the same
 * PAN is always a duplicate. Without a PAN we fall back to an exact-name
 * match — two genuinely different people with one name are distinguished by
 * entering their PANs.
 */
export async function findClientDuplicate(opts: {
  pan?: string | null;
  name?: string | null;
  excludeId?: string;
}): Promise<DuplicateHit | null> {
  const not = opts.excludeId ? { id: { not: opts.excludeId } } : {};
  if (opts.pan?.trim()) {
    const byPan = await prisma.client.findFirst({
      where: { ...not, pan: { equals: opts.pan.trim(), mode: "insensitive" } },
      select: { id: true, name: true, pan: true },
    });
    // A distinct PAN identifies a distinct client — same names are fine then.
    return byPan ? { kind: "pan", client: byPan } : null;
  }
  if (opts.name?.trim()) {
    const byName = await prisma.client.findFirst({
      where: { ...not, name: { equals: opts.name.trim(), mode: "insensitive" } },
      select: { id: true, name: true, pan: true },
    });
    if (byName) return { kind: "name", client: byName };
  }
  return null;
}

/** Readable rejection for a duplicate hit. */
export function duplicateMessage(dup: DuplicateHit): string {
  return dup.kind === "pan"
    ? `A client with PAN ${dup.client.pan} already exists: ${dup.client.name}. Open that record instead of creating a duplicate.`
    : `A client named "${dup.client.name}" already exists. If this is a different person, enter this client's PAN to distinguish them.`;
}

/**
 * Groups of records that already duplicate each other: clients sharing a PAN,
 * and same-named clients that carry no PAN at all.
 */
export async function findExistingDuplicates() {
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, pan: true, type: true, status: true },
    orderBy: { name: "asc" },
  });
  const byPan = new Map<string, typeof clients>();
  const byName = new Map<string, typeof clients>();
  for (const c of clients) {
    const pan = c.pan?.trim().toUpperCase();
    if (pan) {
      if (!byPan.has(pan)) byPan.set(pan, []);
      byPan.get(pan)!.push(c);
    } else {
      const key = c.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(c);
    }
  }
  const groups: { kind: "pan" | "name"; key: string; clients: typeof clients }[] = [];
  for (const [pan, list] of byPan) if (list.length > 1) groups.push({ kind: "pan", key: pan, clients: list });
  for (const [name, list] of byName)
    if (list.length > 1) groups.push({ kind: "name", key: list[0].name, clients: list });
  return groups;
}
