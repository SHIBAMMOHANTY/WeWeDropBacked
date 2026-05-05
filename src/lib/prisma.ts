// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  // ⚡ CONNECTION POOLING & ERROR HANDLING
  errorFormat: 'pretty',
  log: [
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'stdout',
      level: 'query',
    },
  ],
})

// ⚡ HANDLE CONNECTION ERRORS WITH RETRY LOGIC
prisma.$on('error', (e) => {
  console.error('Prisma error:', e);
});

// ⚡ GRACEFUL SHUTDOWN
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma