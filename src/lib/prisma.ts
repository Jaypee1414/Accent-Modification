import { PrismaClient } from "@prisma/client";

declare global {
  let prisma: PrismaClient | undefined;
}

const globalForPrisma = global as typeof globalThis & { prisma: PrismaClient | undefined };

// Ensure the global prisma is used in non-production environments
export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
