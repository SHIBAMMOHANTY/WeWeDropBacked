/**
 * Resets stale PENDING payout transactions older than 2 minutes to FAILED
 * so retries are not blocked.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

  // Find stale PENDING txns
  const staleTxns = await prisma.payoutTransaction.findMany({
    where: {
      status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] },
      createdAt: { lt: twoMinAgo },
    },
    select: { id: true, pickupId: true, status: true, createdAt: true, cfTransferId: true },
  });

  console.log(`Found ${staleTxns.length} stale PENDING transactions:`);
  staleTxns.forEach((t) => console.log(`  - ${t.id} | pickup: ${t.pickupId} | status: ${t.status} | created: ${t.createdAt}`));

  if (staleTxns.length > 0) {
    const resetResult = await prisma.payoutTransaction.updateMany({
      where: {
        id: { in: staleTxns.map((t) => t.id) },
      },
      data: {
        status: 'FAILED',
        failureReason: 'Stale PENDING transaction reset by admin script — no webhook received within 2 min',
      },
    });
    console.log(`✅ Reset ${resetResult.count} transactions to FAILED`);
  }

  // Reset payment_processing quotes back to payment_pending
  const processingQuotes = await prisma.quote.findMany({
    where: { status: 'payment_processing' },
    select: { id: true, quoteNumber: true, status: true },
  });
  console.log(`\nFound ${processingQuotes.length} quotes in payment_processing:`);
  processingQuotes.forEach((q) => console.log(`  - ${q.quoteNumber || q.id}`));

  if (processingQuotes.length > 0) {
    const qReset = await prisma.quote.updateMany({
      where: { status: 'payment_processing' },
      data: { status: 'payment_pending' },
    });
    console.log(`✅ Reset ${qReset.count} quotes back to payment_pending`);
  }

  // Print all unpaid quotes
  const unpaidQuotes = await prisma.quote.findMany({
    where: { status: { in: ['payment_pending', 'payment_processing'] } },
    select: { id: true, quoteNumber: true, status: true },
  });
  console.log(`\nAll quotes pending payment (${unpaidQuotes.length}):`);
  unpaidQuotes.forEach((q) => console.log(`  - ${q.quoteNumber || q.id} | ${q.status}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
