import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const devices = [
  // Apple iPhone 15
  { brand: 'Apple', model: 'iPhone 15', storage: '128GB', launchPrice: 79900, basePriceExcellent: 45000, basePriceGood: 42000, basePriceAverage: 38000, launchDate: '2023-09-12' },
  { brand: 'Apple', model: 'iPhone 15', storage: '256GB', launchPrice: 89900, basePriceExcellent: 52000, basePriceGood: 48000, basePriceAverage: 44000, launchDate: '2023-09-12' },
  { brand: 'Apple', model: 'iPhone 15 Pro', storage: '128GB', launchPrice: 134900, basePriceExcellent: 80000, basePriceGood: 75000, basePriceAverage: 68000, launchDate: '2023-09-12' },
  { brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', launchPrice: 159900, basePriceExcellent: 95000, basePriceGood: 88000, basePriceAverage: 80000, launchDate: '2023-09-12' },

  // Apple iPhone 14
  { brand: 'Apple', model: 'iPhone 14', storage: '128GB', launchPrice: 69900, basePriceExcellent: 35000, basePriceGood: 32000, basePriceAverage: 28000, launchDate: '2022-09-07' },
  { brand: 'Apple', model: 'iPhone 14', storage: '256GB', launchPrice: 79900, basePriceExcellent: 40000, basePriceGood: 36000, basePriceAverage: 32000, launchDate: '2022-09-07' },

  // Samsung Galaxy S24
  { brand: 'Samsung', model: 'Galaxy S24', storage: '128GB', launchPrice: 79999, basePriceExcellent: 42000, basePriceGood: 38000, basePriceAverage: 34000, launchDate: '2024-01-17' },
  { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', launchPrice: 89999, basePriceExcellent: 48000, basePriceGood: 44000, basePriceAverage: 39000, launchDate: '2024-01-17' },
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB', launchPrice: 129999, basePriceExcellent: 75000, basePriceGood: 68000, basePriceAverage: 60000, launchDate: '2024-01-17' },

  // Samsung Galaxy S23
  { brand: 'Samsung', model: 'Galaxy S23', storage: '128GB', launchPrice: 74999, basePriceExcellent: 32000, basePriceGood: 28000, basePriceAverage: 24000, launchDate: '2023-02-01' },
  { brand: 'Samsung', model: 'Galaxy S23 Ultra', storage: '256GB', launchPrice: 124999, basePriceExcellent: 65000, basePriceGood: 58000, basePriceAverage: 52000, launchDate: '2023-02-01' },

  // OnePlus
  { brand: 'OnePlus', model: '12', storage: '12GB/256GB', launchPrice: 64999, basePriceExcellent: 38000, basePriceGood: 34000, basePriceAverage: 30000, launchDate: '2023-12-05' },
  { brand: 'OnePlus', model: '12R', storage: '8GB/128GB', launchPrice: 39999, basePriceExcellent: 22000, basePriceGood: 19000, basePriceAverage: 16000, launchDate: '2024-01-23' },
  { brand: 'OnePlus', model: '11', storage: '8GB/128GB', launchPrice: 56999, basePriceExcellent: 28000, basePriceGood: 24000, basePriceAverage: 20000, launchDate: '2023-02-07' },

  // Xiaomi / Redmi
  { brand: 'Xiaomi', model: '14', storage: '12GB/512GB', launchPrice: 69999, basePriceExcellent: 35000, basePriceGood: 31000, basePriceAverage: 27000, launchDate: '2024-03-07' },
  { brand: 'Xiaomi', model: 'Redmi Note 13 Pro', storage: '8GB/128GB', launchPrice: 25999, basePriceExcellent: 14000, basePriceGood: 12000, basePriceAverage: 10000, launchDate: '2024-01-04' },
  { brand: 'Xiaomi', model: 'Redmi Note 13', storage: '6GB/128GB', launchPrice: 17999, basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 6000, launchDate: '2024-01-04' }
];

async function main() {
  console.log('Seeding device data...');
  for (const device of devices) {
    await prisma.deviceMaster.upsert({
      where: {
        brand_model_storage: {
          brand: device.brand,
          model: device.model,
          storage: device.storage,
        }
      },
      update: {
        launchPrice: device.launchPrice,
        basePriceExcellent: device.basePriceExcellent,
        basePriceGood: device.basePriceGood,
        basePriceAverage: device.basePriceAverage,
        launchDate: device.launchDate,
        isActive: true,
        isDeleted: false
      },
      create: {
        ...device,
        isActive: true,
        isDeleted: false
      }
    });
    console.log(`Upserted ${device.brand} ${device.model} (${device.storage})`);
  }
  console.log('Seeding completed successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
