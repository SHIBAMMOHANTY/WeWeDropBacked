// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma: any =
  globalForPrisma.prisma ??
  new PrismaClient({
    errorFormat: 'pretty',
    log: [
      {
        emit: 'stdout',
        level: 'query',
      },
    ],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;