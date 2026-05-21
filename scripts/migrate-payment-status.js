// Optimized script to populate paymentStatus in existing Order documents based on their latest Payment status.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Starting optimized migration to populate paymentStatus in existing Orders...");
    
    // Fetch all active/non-deleted orders
    const orders = await prisma.order.findMany({
      where: { deleted: false },
      select: { id: true }
    });

    console.log(`Found ${orders.length} active orders to process.`);

    // Fetch all payments ordered by createdAt desc to get the latest payment first
    const payments = await prisma.payment.findMany({
      select: { orderId: true, paymentStatus: true },
      orderBy: { createdAt: "desc" }
    });

    const paymentMetaMap = new Map();
    for (const p of payments) {
      if (p.orderId && !paymentMetaMap.has(p.orderId)) {
        paymentMetaMap.set(p.orderId, p.paymentStatus ?? 0);
      }
    }

    console.log("Built payment status map in-memory successfully.");

    let migratedCount = 0;
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (order) => {
        const statusVal = paymentMetaMap.get(order.id) ?? 0;
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: statusVal }
        });
      }));
      migratedCount += batch.length;
      console.log(`Progress: Migrated ${migratedCount}/${orders.length} orders...`);
    }

    console.log(`Successfully migrated paymentStatus for all ${migratedCount} orders.`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
