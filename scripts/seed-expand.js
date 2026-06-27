// Expanded seed — adds older/mid-range devices missing from the DB
// Run with: node scripts/seed-expand.js
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const prisma = new PrismaClient();

const devices = [
  // ─── Realme (complete coverage) ───────────────────────────────
  // Realme 8 Series
  { brand: 'Realme', model: 'Realme 8 Pro', storage: '128GB', launchPrice: 17999, launchDate: '2021-03-24', basePriceExcellent: 6500, basePriceGood: 5500, basePriceAverage: 4000 },
  { brand: 'Realme', model: 'Realme 8', storage: '128GB', launchPrice: 14999, launchDate: '2021-03-24', basePriceExcellent: 5500, basePriceGood: 4500, basePriceAverage: 3200 },
  { brand: 'Realme', model: 'Realme 8i', storage: '64GB', launchPrice: 13999, launchDate: '2021-10-07', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Realme', model: 'Realme 8i', storage: '128GB', launchPrice: 15999, launchDate: '2021-10-07', basePriceExcellent: 6000, basePriceGood: 5000, basePriceAverage: 3800 },
  { brand: 'Realme', model: 'Realme 8s 5G', storage: '128GB', launchPrice: 17999, launchDate: '2021-09-01', basePriceExcellent: 6500, basePriceGood: 5200, basePriceAverage: 4000 },
  { brand: 'Realme', model: 'Realme 8 5G', storage: '128GB', launchPrice: 15999, launchDate: '2021-05-04', basePriceExcellent: 6000, basePriceGood: 5000, basePriceAverage: 3600 },

  // Realme 7 Series
  { brand: 'Realme', model: 'Realme 7 Pro', storage: '128GB', launchPrice: 19999, launchDate: '2020-09-07', basePriceExcellent: 5500, basePriceGood: 4500, basePriceAverage: 3200 },
  { brand: 'Realme', model: 'Realme 7', storage: '128GB', launchPrice: 14999, launchDate: '2020-09-07', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'Realme', model: 'Realme 7i', storage: '64GB', launchPrice: 12999, launchDate: '2020-10-09', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2400 },
  { brand: 'Realme', model: 'Realme 7 5G', storage: '128GB', launchPrice: 21999, launchDate: '2020-11-24', basePriceExcellent: 6000, basePriceGood: 5000, basePriceAverage: 3800 },

  // Realme 6 Series
  { brand: 'Realme', model: 'Realme 6 Pro', storage: '128GB', launchPrice: 16999, launchDate: '2020-03-05', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'Realme', model: 'Realme 6', storage: '128GB', launchPrice: 12999, launchDate: '2020-03-05', basePriceExcellent: 3800, basePriceGood: 3000, basePriceAverage: 2200 },
  { brand: 'Realme', model: 'Realme 6i', storage: '64GB', launchPrice: 10999, launchDate: '2020-05-20', basePriceExcellent: 3200, basePriceGood: 2500, basePriceAverage: 1800 },
  { brand: 'Realme', model: 'Realme 6s', storage: '64GB', launchPrice: 14999, launchDate: '2020-06-02', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2400 },

  // Realme 5 Series
  { brand: 'Realme', model: 'Realme 5 Pro', storage: '128GB', launchPrice: 13999, launchDate: '2019-09-04', basePriceExcellent: 3500, basePriceGood: 2800, basePriceAverage: 2000 },
  { brand: 'Realme', model: 'Realme 5', storage: '64GB', launchPrice: 9999, launchDate: '2019-09-04', basePriceExcellent: 2800, basePriceGood: 2200, basePriceAverage: 1600 },
  { brand: 'Realme', model: 'Realme 5i', storage: '64GB', launchPrice: 8999, launchDate: '2020-01-09', basePriceExcellent: 2500, basePriceGood: 2000, basePriceAverage: 1500 },
  { brand: 'Realme', model: 'Realme 5s', storage: '64GB', launchPrice: 9999, launchDate: '2019-11-20', basePriceExcellent: 2800, basePriceGood: 2200, basePriceAverage: 1600 },

  // Realme Narzo Series
  { brand: 'Realme', model: 'Realme Narzo 50 Pro', storage: '128GB', launchPrice: 19999, launchDate: '2022-05-18', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Realme', model: 'Realme Narzo 50', storage: '128GB', launchPrice: 14999, launchDate: '2022-03-17', basePriceExcellent: 5500, basePriceGood: 4500, basePriceAverage: 3300 },
  { brand: 'Realme', model: 'Realme Narzo 50A', storage: '128GB', launchPrice: 11999, launchDate: '2021-10-07', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'Realme', model: 'Realme Narzo 30 Pro', storage: '128GB', launchPrice: 16999, launchDate: '2021-03-03', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Realme', model: 'Realme Narzo 30', storage: '128GB', launchPrice: 12999, launchDate: '2021-05-18', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2400 },
  { brand: 'Realme', model: 'Realme Narzo 20 Pro', storage: '128GB', launchPrice: 14999, launchDate: '2020-09-21', basePriceExcellent: 4200, basePriceGood: 3400, basePriceAverage: 2500 },
  { brand: 'Realme', model: 'Realme Narzo 20', storage: '64GB', launchPrice: 10999, launchDate: '2020-09-21', basePriceExcellent: 3200, basePriceGood: 2600, basePriceAverage: 1900 },

  // Realme GT Series (older)
  { brand: 'Realme', model: 'Realme GT 2 Pro', storage: '256GB', launchPrice: 49999, launchDate: '2022-02-14', basePriceExcellent: 15000, basePriceGood: 12000, basePriceAverage: 9000 },
  { brand: 'Realme', model: 'Realme GT 2', storage: '128GB', launchPrice: 34999, launchDate: '2022-02-14', basePriceExcellent: 10000, basePriceGood: 8000, basePriceAverage: 6000 },
  { brand: 'Realme', model: 'Realme GT Neo 3', storage: '128GB', launchPrice: 36999, launchDate: '2022-05-10', basePriceExcellent: 12000, basePriceGood: 10000, basePriceAverage: 7500 },
  { brand: 'Realme', model: 'Realme GT Neo 2', storage: '128GB', launchPrice: 31999, launchDate: '2021-11-09', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 5500 },

  // Realme C Series
  { brand: 'Realme', model: 'Realme C35', storage: '128GB', launchPrice: 12999, launchDate: '2022-02-17', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Realme', model: 'Realme C33', storage: '64GB', launchPrice: 9999, launchDate: '2022-09-09', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2400 },
  { brand: 'Realme', model: 'Realme C31', storage: '64GB', launchPrice: 9999, launchDate: '2022-03-28', basePriceExcellent: 3500, basePriceGood: 2800, basePriceAverage: 2000 },
  { brand: 'Realme', model: 'Realme C30', storage: '32GB', launchPrice: 8499, launchDate: '2022-07-01', basePriceExcellent: 3000, basePriceGood: 2400, basePriceAverage: 1700 },
  { brand: 'Realme', model: 'Realme C25Y', storage: '128GB', launchPrice: 12999, launchDate: '2021-09-14', basePriceExcellent: 4200, basePriceGood: 3400, basePriceAverage: 2500 },
  { brand: 'Realme', model: 'Realme C21Y', storage: '64GB', launchPrice: 9999, launchDate: '2021-08-18', basePriceExcellent: 3200, basePriceGood: 2600, basePriceAverage: 1900 },

  // ─── Redmi (older & complete) ─────────────────────────────────
  // Redmi Note 11 Series
  { brand: 'Redmi', model: 'Redmi Note 11 Pro+', storage: '128GB', launchPrice: 22999, launchDate: '2022-01-06', basePriceExcellent: 8500, basePriceGood: 7000, basePriceAverage: 5200 },
  { brand: 'Redmi', model: 'Redmi Note 11 Pro', storage: '128GB', launchPrice: 20999, launchDate: '2022-01-06', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Redmi', model: 'Redmi Note 11', storage: '128GB', launchPrice: 14999, launchDate: '2022-01-06', basePriceExcellent: 5500, basePriceGood: 4500, basePriceAverage: 3300 },
  { brand: 'Redmi', model: 'Redmi Note 11s', storage: '128GB', launchPrice: 18999, launchDate: '2022-02-09', basePriceExcellent: 7000, basePriceGood: 5600, basePriceAverage: 4200 },

  // Redmi Note 10 Series
  { brand: 'Redmi', model: 'Redmi Note 10 Pro Max', storage: '128GB', launchPrice: 18999, launchDate: '2021-03-04', basePriceExcellent: 7000, basePriceGood: 5600, basePriceAverage: 4200 },
  { brand: 'Redmi', model: 'Redmi Note 10 Pro', storage: '128GB', launchPrice: 15999, launchDate: '2021-03-04', basePriceExcellent: 6000, basePriceGood: 4800, basePriceAverage: 3600 },
  { brand: 'Redmi', model: 'Redmi Note 10', storage: '128GB', launchPrice: 11999, launchDate: '2021-03-04', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'Redmi', model: 'Redmi Note 10s', storage: '128GB', launchPrice: 14999, launchDate: '2021-05-13', basePriceExcellent: 5500, basePriceGood: 4400, basePriceAverage: 3300 },
  { brand: 'Redmi', model: 'Redmi Note 10T', storage: '128GB', launchPrice: 13999, launchDate: '2021-08-20', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },

  // Redmi Note 9 Series
  { brand: 'Redmi', model: 'Redmi Note 9 Pro Max', storage: '128GB', launchPrice: 18999, launchDate: '2020-03-17', basePriceExcellent: 5500, basePriceGood: 4400, basePriceAverage: 3300 },
  { brand: 'Redmi', model: 'Redmi Note 9 Pro', storage: '128GB', launchPrice: 15999, launchDate: '2020-03-17', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Redmi', model: 'Redmi Note 9', storage: '128GB', launchPrice: 13999, launchDate: '2020-07-20', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'Redmi', model: 'Redmi Note 9s', storage: '128GB', launchPrice: 14999, launchDate: '2020-04-28', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },

  // Redmi (numbered series)
  { brand: 'Redmi', model: 'Redmi 12', storage: '128GB', launchPrice: 12999, launchDate: '2023-07-05', basePriceExcellent: 6000, basePriceGood: 5000, basePriceAverage: 3700 },
  { brand: 'Redmi', model: 'Redmi 12 5G', storage: '128GB', launchPrice: 15999, launchDate: '2023-08-15', basePriceExcellent: 7000, basePriceGood: 5800, basePriceAverage: 4400 },
  { brand: 'Redmi', model: 'Redmi 11 Prime', storage: '64GB', launchPrice: 12999, launchDate: '2022-09-06', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Redmi', model: 'Redmi 10', storage: '128GB', launchPrice: 12999, launchDate: '2021-09-09', basePriceExcellent: 4200, basePriceGood: 3400, basePriceAverage: 2500 },
  { brand: 'Redmi', model: 'Redmi 10 Prime', storage: '128GB', launchPrice: 14999, launchDate: '2021-09-09', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Redmi', model: 'Redmi 9', storage: '64GB', launchPrice: 9999, launchDate: '2020-07-14', basePriceExcellent: 3000, basePriceGood: 2400, basePriceAverage: 1700 },
  { brand: 'Redmi', model: 'Redmi 9A', storage: '32GB', launchPrice: 6999, launchDate: '2020-07-14', basePriceExcellent: 2200, basePriceGood: 1700, basePriceAverage: 1200 },
  { brand: 'Redmi', model: 'Redmi 9C', storage: '64GB', launchPrice: 8999, launchDate: '2020-07-14', basePriceExcellent: 2800, basePriceGood: 2200, basePriceAverage: 1600 },

  // ─── POCO (older) ─────────────────────────────────────────────
  { brand: 'POCO', model: 'POCO X5 Pro', storage: '256GB', launchPrice: 24999, launchDate: '2023-02-06', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 7000 },
  { brand: 'POCO', model: 'POCO X5', storage: '128GB', launchPrice: 19999, launchDate: '2023-02-06', basePriceExcellent: 8500, basePriceGood: 7000, basePriceAverage: 5200 },
  { brand: 'POCO', model: 'POCO X4 Pro', storage: '128GB', launchPrice: 18999, launchDate: '2022-03-22', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'POCO', model: 'POCO X4 Pro', storage: '256GB', launchPrice: 21999, launchDate: '2022-03-22', basePriceExcellent: 8500, basePriceGood: 7000, basePriceAverage: 5200 },
  { brand: 'POCO', model: 'POCO X3 Pro', storage: '128GB', launchPrice: 18999, launchDate: '2021-03-30', basePriceExcellent: 6500, basePriceGood: 5200, basePriceAverage: 3900 },
  { brand: 'POCO', model: 'POCO X3 NFC', storage: '64GB', launchPrice: 14999, launchDate: '2020-09-22', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'POCO', model: 'POCO M4 Pro', storage: '128GB', launchPrice: 16999, launchDate: '2022-01-17', basePriceExcellent: 6000, basePriceGood: 4800, basePriceAverage: 3600 },
  { brand: 'POCO', model: 'POCO M4 Pro 5G', storage: '128GB', launchPrice: 19999, launchDate: '2022-03-16', basePriceExcellent: 7000, basePriceGood: 5600, basePriceAverage: 4200 },
  { brand: 'POCO', model: 'POCO M3 Pro 5G', storage: '128GB', launchPrice: 14999, launchDate: '2021-05-19', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'POCO', model: 'POCO M3', storage: '128GB', launchPrice: 10999, launchDate: '2021-02-22', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2400 },
  { brand: 'POCO', model: 'POCO M2 Pro', storage: '128GB', launchPrice: 14999, launchDate: '2020-07-07', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'POCO', model: 'POCO C55', storage: '128GB', launchPrice: 10999, launchDate: '2023-04-13', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'POCO', model: 'POCO C40', storage: '64GB', launchPrice: 8999, launchDate: '2022-07-26', basePriceExcellent: 3200, basePriceGood: 2500, basePriceAverage: 1800 },

  // ─── Xiaomi (older) ───────────────────────────────────────────
  { brand: 'Xiaomi', model: 'Xiaomi 12 Pro', storage: '256GB', launchPrice: 62999, launchDate: '2022-04-27', basePriceExcellent: 22000, basePriceGood: 18000, basePriceAverage: 14000 },
  { brand: 'Xiaomi', model: 'Xiaomi 12', storage: '128GB', launchPrice: 54999, launchDate: '2022-04-27', basePriceExcellent: 18000, basePriceGood: 14500, basePriceAverage: 11000 },
  { brand: 'Xiaomi', model: 'Xiaomi 11T Pro', storage: '128GB', launchPrice: 39999, launchDate: '2021-10-08', basePriceExcellent: 12000, basePriceGood: 10000, basePriceAverage: 7500 },
  { brand: 'Xiaomi', model: 'Xiaomi 11T', storage: '128GB', launchPrice: 29999, launchDate: '2021-10-08', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 5500 },
  { brand: 'Xiaomi', model: 'Xiaomi 11i HyperCharge', storage: '128GB', launchPrice: 26999, launchDate: '2022-01-06', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'Xiaomi', model: 'Mi 11X Pro', storage: '128GB', launchPrice: 39999, launchDate: '2021-04-23', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },
  { brand: 'Xiaomi', model: 'Mi 11X', storage: '128GB', launchPrice: 29999, launchDate: '2021-04-23', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'Xiaomi', model: 'Mi 11 Ultra', storage: '256GB', launchPrice: 69999, launchDate: '2021-04-23', basePriceExcellent: 22000, basePriceGood: 18000, basePriceAverage: 14000 },
  { brand: 'Xiaomi', model: 'Mi 10', storage: '128GB', launchPrice: 49999, launchDate: '2020-05-08', basePriceExcellent: 12000, basePriceGood: 10000, basePriceAverage: 7500 },

  // ─── Samsung (older & mid-range) ──────────────────────────────
  // Galaxy A Series (older)
  { brand: 'Samsung', model: 'Galaxy A53 5G', storage: '128GB', launchPrice: 34999, launchDate: '2022-04-22', basePriceExcellent: 15000, basePriceGood: 12000, basePriceAverage: 9000 },
  { brand: 'Samsung', model: 'Galaxy A33 5G', storage: '128GB', launchPrice: 30999, launchDate: '2022-04-22', basePriceExcellent: 12000, basePriceGood: 9500, basePriceAverage: 7000 },
  { brand: 'Samsung', model: 'Galaxy A23', storage: '128GB', launchPrice: 20999, launchDate: '2022-06-10', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'Samsung', model: 'Galaxy A13', storage: '64GB', launchPrice: 14999, launchDate: '2022-03-28', basePriceExcellent: 5500, basePriceGood: 4400, basePriceAverage: 3300 },
  { brand: 'Samsung', model: 'Galaxy A52s 5G', storage: '128GB', launchPrice: 34999, launchDate: '2021-09-03', basePriceExcellent: 14000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'Samsung', model: 'Galaxy A52', storage: '128GB', launchPrice: 26999, launchDate: '2021-03-17', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },
  { brand: 'Samsung', model: 'Galaxy A32', storage: '128GB', launchPrice: 21999, launchDate: '2021-03-17', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'Samsung', model: 'Galaxy A22 5G', storage: '128GB', launchPrice: 21999, launchDate: '2021-07-13', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Samsung', model: 'Galaxy A22', storage: '128GB', launchPrice: 16999, launchDate: '2021-07-13', basePriceExcellent: 6000, basePriceGood: 4800, basePriceAverage: 3600 },
  { brand: 'Samsung', model: 'Galaxy A12', storage: '64GB', launchPrice: 12999, launchDate: '2021-01-04', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'Samsung', model: 'Galaxy A03s', storage: '32GB', launchPrice: 11999, launchDate: '2021-10-21', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2400 },

  // Galaxy M Series (older)
  { brand: 'Samsung', model: 'Galaxy M53 5G', storage: '128GB', launchPrice: 26999, launchDate: '2022-04-22', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },
  { brand: 'Samsung', model: 'Galaxy M33 5G', storage: '128GB', launchPrice: 21999, launchDate: '2022-04-02', basePriceExcellent: 8500, basePriceGood: 7000, basePriceAverage: 5200 },
  { brand: 'Samsung', model: 'Galaxy M23 5G', storage: '128GB', launchPrice: 19999, launchDate: '2022-04-25', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Samsung', model: 'Galaxy M13', storage: '64GB', launchPrice: 13999, launchDate: '2022-07-21', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Samsung', model: 'Galaxy M52 5G', storage: '128GB', launchPrice: 27999, launchDate: '2021-09-28', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },
  { brand: 'Samsung', model: 'Galaxy M32', storage: '128GB', launchPrice: 19999, launchDate: '2021-07-01', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Samsung', model: 'Galaxy M12', storage: '64GB', launchPrice: 12999, launchDate: '2021-03-18', basePriceExcellent: 4500, basePriceGood: 3600, basePriceAverage: 2700 },
  { brand: 'Samsung', model: 'Galaxy M31s', storage: '128GB', launchPrice: 19999, launchDate: '2020-08-06', basePriceExcellent: 6500, basePriceGood: 5200, basePriceAverage: 3900 },
  { brand: 'Samsung', model: 'Galaxy M31', storage: '64GB', launchPrice: 14999, launchDate: '2020-03-25', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },
  { brand: 'Samsung', model: 'Galaxy M21', storage: '64GB', launchPrice: 13999, launchDate: '2020-03-16', basePriceExcellent: 4200, basePriceGood: 3400, basePriceAverage: 2500 },

  // Galaxy F Series
  { brand: 'Samsung', model: 'Galaxy F54 5G', storage: '128GB', launchPrice: 30999, launchDate: '2023-07-06', basePriceExcellent: 16000, basePriceGood: 13000, basePriceAverage: 10000 },
  { brand: 'Samsung', model: 'Galaxy F34 5G', storage: '128GB', launchPrice: 22999, launchDate: '2023-08-10', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 7000 },
  { brand: 'Samsung', model: 'Galaxy F14 5G', storage: '128GB', launchPrice: 14999, launchDate: '2023-04-06', basePriceExcellent: 7000, basePriceGood: 5600, basePriceAverage: 4200 },
  { brand: 'Samsung', model: 'Galaxy F23 5G', storage: '128GB', launchPrice: 18999, launchDate: '2022-03-08', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Samsung', model: 'Galaxy F13', storage: '64GB', launchPrice: 12999, launchDate: '2022-07-08', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },

  // ─── OnePlus (older) ──────────────────────────────────────────
  { brand: 'OnePlus', model: 'OnePlus 10 Pro', storage: '128GB', launchPrice: 66999, launchDate: '2022-03-31', basePriceExcellent: 25000, basePriceGood: 21000, basePriceAverage: 16000 },
  { brand: 'OnePlus', model: 'OnePlus 10 Pro', storage: '256GB', launchPrice: 71999, launchDate: '2022-03-31', basePriceExcellent: 28000, basePriceGood: 23000, basePriceAverage: 18000 },
  { brand: 'OnePlus', model: 'OnePlus 10T', storage: '128GB', launchPrice: 49999, launchDate: '2022-08-03', basePriceExcellent: 18000, basePriceGood: 15000, basePriceAverage: 11000 },
  { brand: 'OnePlus', model: 'OnePlus 10T', storage: '256GB', launchPrice: 55999, launchDate: '2022-08-03', basePriceExcellent: 21000, basePriceGood: 17000, basePriceAverage: 13000 },
  { brand: 'OnePlus', model: 'OnePlus 9 Pro', storage: '128GB', launchPrice: 64999, launchDate: '2021-03-23', basePriceExcellent: 20000, basePriceGood: 16500, basePriceAverage: 13000 },
  { brand: 'OnePlus', model: 'OnePlus 9', storage: '128GB', launchPrice: 49999, launchDate: '2021-03-23', basePriceExcellent: 15000, basePriceGood: 12000, basePriceAverage: 9000 },
  { brand: 'OnePlus', model: 'OnePlus 9R', storage: '128GB', launchPrice: 39999, launchDate: '2021-03-23', basePriceExcellent: 12000, basePriceGood: 9500, basePriceAverage: 7000 },
  { brand: 'OnePlus', model: 'OnePlus 8T', storage: '128GB', launchPrice: 42999, launchDate: '2020-10-16', basePriceExcellent: 12000, basePriceGood: 9500, basePriceAverage: 7000 },
  { brand: 'OnePlus', model: 'OnePlus 8 Pro', storage: '128GB', launchPrice: 54999, launchDate: '2020-04-29', basePriceExcellent: 14000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'OnePlus', model: 'OnePlus 8', storage: '128GB', launchPrice: 41999, launchDate: '2020-04-29', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },
  { brand: 'OnePlus', model: 'OnePlus Nord 3', storage: '128GB', launchPrice: 33999, launchDate: '2023-07-05', basePriceExcellent: 17000, basePriceGood: 14000, basePriceAverage: 11000 },
  { brand: 'OnePlus', model: 'OnePlus Nord 2T', storage: '128GB', launchPrice: 28999, launchDate: '2022-06-01', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },
  { brand: 'OnePlus', model: 'OnePlus Nord 2', storage: '128GB', launchPrice: 27999, launchDate: '2021-07-22', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 5500 },
  { brand: 'OnePlus', model: 'OnePlus Nord CE 2', storage: '128GB', launchPrice: 23999, launchDate: '2022-02-17', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'OnePlus', model: 'OnePlus Nord CE 2 Lite', storage: '128GB', launchPrice: 19999, launchDate: '2022-04-28', basePriceExcellent: 7000, basePriceGood: 5600, basePriceAverage: 4200 },

  // ─── Vivo (older) ─────────────────────────────────────────────
  { brand: 'Vivo', model: 'Vivo X80 Pro', storage: '256GB', launchPrice: 79999, launchDate: '2022-05-18', basePriceExcellent: 28000, basePriceGood: 23000, basePriceAverage: 18000 },
  { brand: 'Vivo', model: 'Vivo X70 Pro+', storage: '256GB', launchPrice: 79990, launchDate: '2021-10-08', basePriceExcellent: 24000, basePriceGood: 20000, basePriceAverage: 15000 },
  { brand: 'Vivo', model: 'Vivo V25 Pro', storage: '256GB', launchPrice: 35999, launchDate: '2022-09-16', basePriceExcellent: 14000, basePriceGood: 11500, basePriceAverage: 8500 },
  { brand: 'Vivo', model: 'Vivo V25e', storage: '128GB', launchPrice: 28999, launchDate: '2022-09-30', basePriceExcellent: 10000, basePriceGood: 8000, basePriceAverage: 6000 },
  { brand: 'Vivo', model: 'Vivo V23 Pro', storage: '256GB', launchPrice: 38999, launchDate: '2022-01-05', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 8000 },
  { brand: 'Vivo', model: 'Vivo V23e', storage: '128GB', launchPrice: 24999, launchDate: '2022-01-05', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'Vivo', model: 'Vivo V21 5G', storage: '128GB', launchPrice: 29990, launchDate: '2021-04-29', basePriceExcellent: 10000, basePriceGood: 8000, basePriceAverage: 6000 },
  { brand: 'Vivo', model: 'Vivo Y75 5G', storage: '128GB', launchPrice: 22999, launchDate: '2022-02-09', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'Vivo', model: 'Vivo Y73', storage: '128GB', launchPrice: 20990, launchDate: '2021-06-23', basePriceExcellent: 7000, basePriceGood: 5600, basePriceAverage: 4200 },

  // ─── OPPO (older) ─────────────────────────────────────────────
  { brand: 'OPPO', model: 'OPPO Reno 8 Pro', storage: '256GB', launchPrice: 45999, launchDate: '2022-07-18', basePriceExcellent: 16000, basePriceGood: 13000, basePriceAverage: 9800 },
  { brand: 'OPPO', model: 'OPPO Reno 8', storage: '128GB', launchPrice: 35999, launchDate: '2022-07-18', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },
  { brand: 'OPPO', model: 'OPPO Reno 8T 5G', storage: '128GB', launchPrice: 35999, launchDate: '2023-02-13', basePriceExcellent: 14000, basePriceGood: 11500, basePriceAverage: 8500 },
  { brand: 'OPPO', model: 'OPPO Reno 7 Pro', storage: '256GB', launchPrice: 39999, launchDate: '2021-12-01', basePriceExcellent: 13000, basePriceGood: 10500, basePriceAverage: 7800 },
  { brand: 'OPPO', model: 'OPPO Reno 7', storage: '128GB', launchPrice: 27999, launchDate: '2021-12-01', basePriceExcellent: 9000, basePriceGood: 7200, basePriceAverage: 5400 },
  { brand: 'OPPO', model: 'OPPO Reno 6 Pro', storage: '256GB', launchPrice: 39990, launchDate: '2021-06-16', basePriceExcellent: 12000, basePriceGood: 9500, basePriceAverage: 7200 },
  { brand: 'OPPO', model: 'OPPO F21 Pro', storage: '128GB', launchPrice: 26999, launchDate: '2022-04-11', basePriceExcellent: 9000, basePriceGood: 7200, basePriceAverage: 5400 },
  { brand: 'OPPO', model: 'OPPO A96', storage: '128GB', launchPrice: 21999, launchDate: '2022-04-01', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },

  // ─── Motorola (older) ─────────────────────────────────────────
  { brand: 'Motorola', model: 'Motorola Edge 30 Pro', storage: '128GB', launchPrice: 49999, launchDate: '2022-02-24', basePriceExcellent: 16000, basePriceGood: 13000, basePriceAverage: 9800 },
  { brand: 'Motorola', model: 'Motorola Edge 30 Ultra', storage: '256GB', launchPrice: 59999, launchDate: '2022-09-09', basePriceExcellent: 20000, basePriceGood: 16000, basePriceAverage: 12000 },
  { brand: 'Motorola', model: 'Motorola Edge 40', storage: '256GB', launchPrice: 29999, launchDate: '2023-05-23', basePriceExcellent: 14000, basePriceGood: 11500, basePriceAverage: 8500 },
  { brand: 'Motorola', model: 'Motorola Edge 40 Pro', storage: '256GB', launchPrice: 59999, launchDate: '2023-04-05', basePriceExcellent: 24000, basePriceGood: 20000, basePriceAverage: 15000 },
  { brand: 'Motorola', model: 'Moto G82 5G', storage: '128GB', launchPrice: 21999, launchDate: '2022-06-08', basePriceExcellent: 9000, basePriceGood: 7200, basePriceAverage: 5400 },
  { brand: 'Motorola', model: 'Moto G72', storage: '128GB', launchPrice: 19999, launchDate: '2022-10-03', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 4800 },
  { brand: 'Motorola', model: 'Moto G62 5G', storage: '128GB', launchPrice: 19999, launchDate: '2022-07-14', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Motorola', model: 'Moto G52', storage: '128GB', launchPrice: 16999, launchDate: '2022-03-28', basePriceExcellent: 6500, basePriceGood: 5200, basePriceAverage: 3900 },
  { brand: 'Motorola', model: 'Moto G32', storage: '64GB', launchPrice: 12999, launchDate: '2022-08-23', basePriceExcellent: 5000, basePriceGood: 4000, basePriceAverage: 3000 },

  // ─── iQOO (older) ─────────────────────────────────────────────
  { brand: 'iQOO', model: 'iQOO 9 Pro', storage: '256GB', launchPrice: 64990, launchDate: '2022-02-25', basePriceExcellent: 22000, basePriceGood: 18000, basePriceAverage: 14000 },
  { brand: 'iQOO', model: 'iQOO 9', storage: '128GB', launchPrice: 42999, launchDate: '2022-02-25', basePriceExcellent: 14000, basePriceGood: 11500, basePriceAverage: 8500 },
  { brand: 'iQOO', model: 'iQOO Neo 6', storage: '128GB', launchPrice: 30999, launchDate: '2022-05-26', basePriceExcellent: 10000, basePriceGood: 8000, basePriceAverage: 6000 },
  { brand: 'iQOO', model: 'iQOO Z6 Pro', storage: '128GB', launchPrice: 26999, launchDate: '2022-07-08', basePriceExcellent: 9000, basePriceGood: 7200, basePriceAverage: 5400 },
  { brand: 'iQOO', model: 'iQOO Z6 Lite', storage: '128GB', launchPrice: 17999, launchDate: '2022-09-08', basePriceExcellent: 6500, basePriceGood: 5200, basePriceAverage: 3900 },
  { brand: 'iQOO', model: 'iQOO Z7 Pro', storage: '256GB', launchPrice: 27999, launchDate: '2023-07-03', basePriceExcellent: 13000, basePriceGood: 10500, basePriceAverage: 7800 },
  { brand: 'iQOO', model: 'iQOO Z7s 5G', storage: '128GB', launchPrice: 23999, launchDate: '2023-09-04', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 6700 },

  // ─── Nothing (older) ──────────────────────────────────────────
  { brand: 'Nothing', model: 'Nothing Phone (1)', storage: '256GB', launchPrice: 36999, launchDate: '2022-07-12', basePriceExcellent: 15000, basePriceGood: 12000, basePriceAverage: 9000 },

  // ─── Google Pixel (older) ─────────────────────────────────────
  { brand: 'Google', model: 'Pixel 6a', storage: '128GB', launchPrice: 43999, launchDate: '2022-07-28', basePriceExcellent: 18000, basePriceGood: 15000, basePriceAverage: 11000 },
  { brand: 'Google', model: 'Pixel 6 Pro', storage: '128GB', launchPrice: 75000, launchDate: '2021-10-28', basePriceExcellent: 22000, basePriceGood: 18000, basePriceAverage: 14000 },
  { brand: 'Google', model: 'Pixel 6', storage: '128GB', launchPrice: 55000, launchDate: '2021-10-28', basePriceExcellent: 16000, basePriceGood: 13000, basePriceAverage: 9800 },

  // ─── Infinix (older) ──────────────────────────────────────────
  { brand: 'Infinix', model: 'Infinix Note 12 Pro', storage: '128GB', launchPrice: 19999, launchDate: '2022-08-22', basePriceExcellent: 7500, basePriceGood: 6000, basePriceAverage: 4500 },
  { brand: 'Infinix', model: 'Infinix Hot 30i', storage: '64GB', launchPrice: 9999, launchDate: '2023-03-22', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2400 },
  { brand: 'Infinix', model: 'Infinix Smart 7', storage: '64GB', launchPrice: 7999, launchDate: '2023-02-16', basePriceExcellent: 3000, basePriceGood: 2400, basePriceAverage: 1700 },

  // ─── Samsung Galaxy S20 Series ────────────────────────────────
  { brand: 'Samsung', model: 'Galaxy S20 FE', storage: '128GB', launchPrice: 49999, launchDate: '2020-10-02', basePriceExcellent: 14000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'Samsung', model: 'Galaxy S20+', storage: '128GB', launchPrice: 73999, launchDate: '2020-03-06', basePriceExcellent: 16000, basePriceGood: 13000, basePriceAverage: 9800 },
  { brand: 'Samsung', model: 'Galaxy S20', storage: '128GB', launchPrice: 66999, launchDate: '2020-03-06', basePriceExcellent: 13000, basePriceGood: 10500, basePriceAverage: 7800 },
];

async function seed() {
  console.log(`\n🚀 Expanding device catalog — ${devices.length} devices to add...\n`);
  let added = 0, updated = 0, failed = 0;

  for (const device of devices) {
    try {
      const existing = await prisma.deviceMaster.findFirst({
        where: { brand: device.brand, model: device.model, storage: device.storage },
      });

      if (existing) {
        await prisma.deviceMaster.update({
          where: { id: existing.id },
          data: { ...device, isActive: true },
        });
        updated++;
        console.log(`  🔄 Updated: ${device.brand} ${device.model} (${device.storage})`);
      } else {
        await prisma.deviceMaster.create({ data: { ...device, isActive: true } });
        added++;
        console.log(`  ✅ Added:   ${device.brand} ${device.model} (${device.storage})`);
      }
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed:  ${device.brand} ${device.model} (${device.storage}) — ${err.message}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`🎉 Done! Added: ${added} | Updated: ${updated} | Failed: ${failed}`);
  console.log(`   Total in DB now: 139 + ${added} = ${139 + added} devices`);
  console.log(`═══════════════════════════════════════════\n`);
  await prisma.$disconnect();
}

seed().catch(async err => {
  console.error('Seed crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
