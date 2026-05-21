import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Starting migration to populate paymentStatus in existing Orders...");
    
    // Fetch all active/non-deleted orders
    const orders = await prisma.order.findMany({
      where: { deleted: false },
      select: { id: true, orderId: true, paymentId: true }
    });

    console.log(`Found ${orders.length} active orders to process.`);

    let migratedCount = 0;
    for (const order of orders) {
      // Find the latest payment for this order by orderId (MongoDB ObjectId)
      const latestPayment = await prisma.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
        select: { paymentStatus: true }
      });

      // Default payment status to 0 (PENDING) if no payment is found
      const statusVal = latestPayment?.paymentStatus ?? 0;

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: statusVal }
      });
      migratedCount++;
    }

    console.log(`Successfully migrated paymentStatus for ${migratedCount} orders.`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
