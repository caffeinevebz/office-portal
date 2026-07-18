import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "./src/lib/seed-data";
const prisma = new PrismaClient();
async function main() {
  const tables: { tablename: string }[] =
    await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  for (const t of tables)
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t.tablename}" CASCADE`);
  await seedDemoData(prisma);
  console.log("reseeded");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
