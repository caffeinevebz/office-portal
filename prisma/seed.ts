import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../src/lib/seed-data";

const prisma = new PrismaClient();

seedDemoData(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
