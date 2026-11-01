// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma: any =
  globalForPrisma.prisma ??
  new PrismaClient({
    errorFormat: 'minimal',
    log:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }],
  });

// Always cache Prisma instance in globalThis across serverless warm invocations
globalForPrisma.prisma = prisma;
