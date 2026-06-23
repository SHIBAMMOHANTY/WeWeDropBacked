import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

const devicesToSeed = [
  // iPhone 13
  {
    brand: 'Apple',
    model: 'iPhone 13',
    storage: '128GB',
    launchPrice: 79900,
    launchDate: '2021-09-24',
    basePriceExcellent: 32000,
    basePriceGood: 29000,
    basePriceAverage: 25000,
    isActive: true,
  },
  {
    brand: 'Apple',
    model: 'iPhone 13',
    storage: '256GB',
    launchPrice: 89900,
    launchDate: '2021-09-24',
    basePriceExcellent: 36000,
    basePriceGood: 33000,
    basePriceAverage: 28000,
    isActive: true,
  },
  // iPhone 14
  {
    brand: 'Apple',
    model: 'iPhone 14',
    storage: '128GB',
    launchPrice: 79900,
    launchDate: '2022-09-16',
    basePriceExcellent: 42000,
    basePriceGood: 38000,
    basePriceAverage: 33000,
    isActive: true,
  },
  {
    brand: 'Apple',
    model: 'iPhone 14',
    storage: '256GB',
    launchPrice: 89900,
    launchDate: '2022-09-16',
    basePriceExcellent: 47000,
    basePriceGood: 43000,
    basePriceAverage: 37000,
    isActive: true,
  },
  // Samsung Galaxy S23
  {
    brand: 'Samsung',
    model: 'Galaxy S23',
    storage: '128GB',
    launchPrice: 74999,
    launchDate: '2023-02-17',
    basePriceExcellent: 35000,
    basePriceGood: 31000,
    basePriceAverage: 26000,
    isActive: true,
  },
  {
    brand: 'Samsung',
    model: 'Galaxy S23',
    storage: '256GB',
    launchPrice: 79999,
    launchDate: '2023-02-17',
    basePriceExcellent: 38000,
    basePriceGood: 34000,
    basePriceAverage: 29000,
    isActive: true,
  },
];

const priceRulesToSeed = {
  screenDamageDeduction: 3500,
  batteryDeduction: 1500,
  cameraDeduction: 2000,
  fingerprintDeduction: 1200,
  faceIdDeduction: 1800,
  bodyDamageDeduction: 1500,
  speakerDeduction: 800,
  chargingPortDeduction: 800,
  isActive: true,
};

async function seed() {
  try {
    console.log('⚡ Connecting and seeding database via Prisma (TS)...');

    // 1. Seed Price Rules
    console.log('🧹 Cleaning existing Price Rules...');
    await prisma.priceRule.deleteMany({});
    
    console.log('🌱 Seeding Price Rules...');
    const rule = await prisma.priceRule.create({
      data: priceRulesToSeed,
    });
    console.log('✅ Price Rules seeded successfully:', rule.id);

    // 2. Seed Device Master
    console.log('🧹 Cleaning existing Device Master records...');
    await prisma.deviceMaster.deleteMany({});

    console.log('🌱 Seeding Device Master records...');
    for (const device of devicesToSeed) {
      await prisma.deviceMaster.create({
        data: device,
      });
    }
    console.log(`✅ Seeded ${devicesToSeed.length} devices successfully.`);

    console.log('🎉 Seeding completed successfully!');
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed with error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

seed();
