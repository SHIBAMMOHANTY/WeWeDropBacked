import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const devices = await prisma.deviceMaster.findMany();
  
  let updatedCount = 0;

  for (const device of devices) {
    let newStorage = device.storage;
    
    // Add RAM if missing
    if (!newStorage.includes('/')) {
      if (newStorage === '32GB') newStorage = '3GB/32GB';
      else if (newStorage === '64GB') newStorage = '4GB/64GB';
      else if (newStorage === '128GB') newStorage = '6GB/128GB';
      else if (newStorage === '256GB') newStorage = '8GB/256GB';
      else if (newStorage === '512GB') newStorage = '12GB/512GB';
      else if (newStorage === '1TB') newStorage = '16GB/1TB';
      else newStorage = `6GB/${newStorage}`; // fallback
    }

    // Increase prices by 20% (multiplier 1.20)
    const newExcellent = Math.round(device.basePriceExcellent * 1.20);
    const newGood = Math.round(device.basePriceGood * 1.20);
    const newAverage = Math.round(device.basePriceAverage * 1.20);

    if (
      newStorage !== device.storage ||
      newExcellent !== device.basePriceExcellent ||
      newGood !== device.basePriceGood ||
      newAverage !== device.basePriceAverage
    ) {
      await prisma.deviceMaster.update({
        where: { id: device.id },
        data: {
          storage: newStorage,
          basePriceExcellent: newExcellent,
          basePriceGood: newGood,
          basePriceAverage: newAverage,
        },
      });
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${updatedCount} devices with new RAM/ROM formats and 20% higher prices.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
