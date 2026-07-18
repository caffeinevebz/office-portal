import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";

// Unauthenticated liveness check that also touches the database. Point an
// uptime monitor at this endpoint to keep a serverless Postgres (e.g. Neon)
// from autosuspending between visits — cold starts are the single biggest
// source of slow first requests on free-tier deployments.
export const GET = route(async () => {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return ok({ ok: true, db: `${Date.now() - started}ms` });
});
