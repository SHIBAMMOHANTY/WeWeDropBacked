// Optimized script to backfill paymentStatus in existing OrderHistory documents.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function mapPaymentStatus(status) {
  switch (Number(status)) {
    case -1:
      return 'REJECTED';
    case 0:
      return 'PENDING';
    case 1:
      return 'VERIFY';
    default:
      return 'UNKNOWN';
  }
}

async function main() {
  try {
    console.log("Starting optimized migration to backfill paymentStatus in existing OrderHistory snapshots...");
    
    // Fetch all history records
    const historyRecords = await prisma.orderHistory.findMany({
      select: {
        id: true,
        orderId: true,
        beforeState: true,
        afterState: true,
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

    console.log("Built payment transitions index in-memory successfully.");

    // Fetch all orders to serve as a secondary fallback if no payment is found
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
      let beforeState = history.beforeState;
      let afterState = history.afterState;

      // Check if already corrected
      const beforeNeedsFix = beforeState && beforeState.id && beforeState.paymentStatus === undefined;
      const afterNeedsFix = afterState && afterState.id && afterState.paymentStatus === undefined;

      if (beforeNeedsFix || afterNeedsFix) {
        // Resolve correct paymentStatus at the time of history record creation
        const orderPayments = paymentsByOrder.get(history.orderId) || [];
        let statusVal = 0;
        let foundHistoricalPayment = false;

        for (const p of orderPayments) {
          if (new Date(p.createdAt) <= new Date(history.createdAt)) {
            statusVal = p.paymentStatus ?? 0;
            foundHistoricalPayment = true;
          } else {
            break;
          }
        }

        // Fallback to order's current status if no historical payment is recorded yet but the order has one
        if (!foundHistoricalPayment && orderStatusMap.has(history.orderId)) {
          statusVal = orderStatusMap.get(history.orderId);
        }

        const updatePayload = {};

        if (beforeState && typeof beforeState === 'object') {
          const updatedBefore = { ...beforeState };
          updatedBefore.paymentStatus = statusVal;
          updatedBefore.paymentStatusLabel = mapPaymentStatus(statusVal);
          updatePayload.beforeState = updatedBefore;
        }

        if (afterState && typeof afterState === 'object') {
          const updatedAfter = { ...afterState };
          updatedAfter.paymentStatus = statusVal;
          updatedAfter.paymentStatusLabel = mapPaymentStatus(statusVal);
          updatePayload.afterState = updatedAfter;
        }

        recordsToUpdate.push({
          id: history.id,
          data: updatePayload
        });
      }
    }

    console.log(`Identified ${recordsToUpdate.length} OrderHistory records requiring backfill.`);

    for (let i = 0; i < recordsToUpdate.length; i += BATCH_SIZE) {
      const batch = recordsToUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (record) => {
        await prisma.orderHistory.update({
          where: { id: record.id },
          data: record.data
        });
      }));
      updatedCount += batch.length;
      console.log(`Progress: Backfilled ${updatedCount}/${recordsToUpdate.length} history records...`);
    }

    console.log(`Successfully completed OrderHistory backfill for ${updatedCount} records.`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error("OrderHistory migration failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
