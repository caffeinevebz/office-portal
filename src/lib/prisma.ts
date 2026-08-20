import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot-reloads in development to
// avoid exhausting database connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * How long an interactive transaction may take.
 *
 * Prisma allows one 5 seconds by default, which is generous against a database
 * on the same machine and nowhere near enough against a hosted one: every
 * query in the transaction is a network round trip, so a handful of rows can
 * spend the whole budget and the transaction expires mid-write (P2028). That
 * showed up as "Internal server error" on saving an invoice with several
 * lines. The work inside these transactions is small; the waiting is not.
 */
export const TX_BUDGET = { timeout: 20_000, maxWait: 10_000 } as const;
