// Optimized script to backfill top-level paymentStatus column in existing OrderHistory records.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Starting optimized migration to backfill top-level paymentStatus in existing OrderHistory records...");
    
    // Fetch all history records
    const historyRecords = await prisma.orderHistory.findMany({
      select: {
        id: true,
        orderId: true,
        beforeState: true,
        afterState: true,
        paymentStatus: true,
        createdAt: true
      }
    });

    console.log(`Found ${historyRecords.length} history records in database.`);

    // Fetch all payments ordered by createdAt asc to compute correct historical state transitions in memory
    const payments = await prisma.payment.findMany({
      select: { orderId: true, paymentStatus: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    });

    const paymentsByOrder = new Map();
    for (const p of payments) {
      if (p.orderId) {
        if (!paymentsByOrder.has(p.orderId)) {
          paymentsByOrder.set(p.orderId, []);
        }
        paymentsByOrder.get(p.orderId).push(p);
      }
    }

    // Fetch all orders to serve as fallback
    const orders = await prisma.order.findMany({
      select: { id: true, paymentStatus: true }
    });
    const orderStatusMap = new Map();
    for (const order of orders) {
      orderStatusMap.set(order.id, order.paymentStatus ?? 0);
    }

    let updatedCount = 0;
    const BATCH_SIZE = 100;
    const recordsToUpdate = [];

    for (const history of historyRecords) {
      const beforeState = history.beforeState;
      const afterState = history.afterState;

      // Extract existing status from snapshots if present
      let statusVal = null;
      if (afterState && typeof afterState === 'object' && afterState.paymentStatus !== undefined) {
        statusVal = Number(afterState.paymentStatus);
      } else if (beforeState && typeof beforeState === 'object' && beforeState.paymentStatus !== undefined) {
        statusVal = Number(beforeState.paymentStatus);
      }

      // If still null, compute from payments
      if (statusVal === null) {
        const orderPayments = paymentsByOrder.get(history.orderId) || [];
        statusVal = 0;
        let foundHistoricalPayment = false;

        for (const p of orderPayments) {
          if (new Date(p.createdAt) <= new Date(history.createdAt)) {
            statusVal = p.paymentStatus ?? 0;
            foundHistoricalPayment = true;
          } else {
            break;
          }
        }

        if (!foundHistoricalPayment && orderStatusMap.has(history.orderId)) {
          statusVal = orderStatusMap.get(history.orderId);
        }
      }

      // We backfill if paymentStatus is not already equal to statusVal or is undefined/0
      // To be safe and thorough, let's always write it
      recordsToUpdate.push({
        id: history.id,
        data: {
          paymentStatus: statusVal
        }
      });
    }

    console.log(`Prepared ${recordsToUpdate.length} OrderHistory records for top-level paymentStatus updates.`);

    for (let i = 0; i < recordsToUpdate.length; i += BATCH_SIZE) {
      const batch = recordsToUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (record) => {
        await prisma.orderHistory.update({
          where: { id: record.id },
          data: record.data
        });
      }));
      updatedCount += batch.length;
      console.log(`Progress: Updated ${updatedCount}/${recordsToUpdate.length} history records...`);
    }

    console.log(`Successfully completed top-level paymentStatus backfill for ${updatedCount} OrderHistory records.`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error("OrderHistory top-level backfill failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
