import "server-only";
import { prisma } from "@/lib/prisma";

// Register numbering for the physical-document inward/outward register.
// Numbers restart each Indian financial year: IN-2627-001, OUT-2627-001, …

/** FY prefix for a date, e.g. 9 Jul 2026 -> "2627" (FY 2026-27). */
export function fyPrefix(date = new Date()): string {
  const start = date.getMonth() + 1 >= 4 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

function bump(latest: string | null | undefined, prefix: string): string {
  const tail = latest?.slice(prefix.length);
  const n = tail && /^\d+$/.test(tail) ? parseInt(tail, 10) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

export async function nextInwardNumber(): Promise<string> {
  const prefix = `IN-${fyPrefix()}-`;
  const latest = await prisma.docPacket.findFirst({
    where: { inwardNumber: { startsWith: prefix } },
    orderBy: { inwardNumber: "desc" },
    select: { inwardNumber: true },
  });
  return bump(latest?.inwardNumber, prefix);
}

export async function nextOutwardNumber(): Promise<string> {
  const prefix = `OUT-${fyPrefix()}-`;
  const latest = await prisma.packetMovement.findFirst({
    where: { outwardNumber: { startsWith: prefix } },
    orderBy: { outwardNumber: "desc" },
    select: { outwardNumber: true },
  });
  return bump(latest?.outwardNumber, prefix);
}
