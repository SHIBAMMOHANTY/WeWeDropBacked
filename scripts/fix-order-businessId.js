// Script to fix malformed businessId fields in Order documents
// This script finds orders where businessId is a business name (not ObjectId),
// looks up the correct Business document by dealerName, and updates the order's businessId to the Business _id.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function isValidObjectId(id) {
  // MongoDB ObjectId is a 24-character hex string
  return typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
}

async function main() {
  const orders = await prisma.order.findMany();
  let fixed = 0;
  for (const order of orders) {
    if (order.businessId && !(await isValidObjectId(order.businessId))) {
      // Try to find the business by dealerName
      const business = await prisma.business.findFirst({
        where: { dealerName: order.businessId }
      });
      if (business) {
        await prisma.order.update({
          where: { id: order.id },
          data: { businessId: business.id }
        });
        console.log(`Fixed order ${order.id}: set businessId to ${business.id}`);
        fixed++;
      } else {
        console.warn(`No business found for dealerName: ${order.businessId} (order ${order.id})`);
      }
    }
  }
  console.log(`Done. Fixed ${fixed} orders.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
