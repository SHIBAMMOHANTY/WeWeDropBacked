// Plain JS seed script — run with: node scripts/seed-devices-full.js
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const prisma = new PrismaClient();

const devices = [
  // ─── Apple iPhone ─────────────────────────────────────────────
  { brand: 'Apple', model: 'iPhone 16 Pro Max', storage: '256GB', launchPrice: 159900, launchDate: '2024-09-20', basePriceExcellent: 120000, basePriceGood: 108000, basePriceAverage: 95000 },
  { brand: 'Apple', model: 'iPhone 16 Pro Max', storage: '512GB', launchPrice: 179900, launchDate: '2024-09-20', basePriceExcellent: 135000, basePriceGood: 120000, basePriceAverage: 105000 },
  { brand: 'Apple', model: 'iPhone 16 Pro', storage: '128GB', launchPrice: 119900, launchDate: '2024-09-20', basePriceExcellent: 90000, basePriceGood: 80000, basePriceAverage: 70000 },
  { brand: 'Apple', model: 'iPhone 16 Pro', storage: '256GB', launchPrice: 129900, launchDate: '2024-09-20', basePriceExcellent: 98000, basePriceGood: 87000, basePriceAverage: 76000 },
  { brand: 'Apple', model: 'iPhone 16', storage: '128GB', launchPrice: 79900, launchDate: '2024-09-20', basePriceExcellent: 62000, basePriceGood: 55000, basePriceAverage: 48000 },
  { brand: 'Apple', model: 'iPhone 16', storage: '256GB', launchPrice: 89900, launchDate: '2024-09-20', basePriceExcellent: 70000, basePriceGood: 62000, basePriceAverage: 54000 },
  { brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', launchPrice: 159900, launchDate: '2023-09-22', basePriceExcellent: 100000, basePriceGood: 88000, basePriceAverage: 76000 },
  { brand: 'Apple', model: 'iPhone 15 Pro', storage: '128GB', launchPrice: 134900, launchDate: '2023-09-22', basePriceExcellent: 82000, basePriceGood: 72000, basePriceAverage: 62000 },
  { brand: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', launchPrice: 144900, launchDate: '2023-09-22', basePriceExcellent: 90000, basePriceGood: 79000, basePriceAverage: 68000 },
  { brand: 'Apple', model: 'iPhone 15', storage: '128GB', launchPrice: 79900, launchDate: '2023-09-22', basePriceExcellent: 55000, basePriceGood: 48000, basePriceAverage: 41000 },
  { brand: 'Apple', model: 'iPhone 15', storage: '256GB', launchPrice: 89900, launchDate: '2023-09-22', basePriceExcellent: 62000, basePriceGood: 54000, basePriceAverage: 46000 },
  { brand: 'Apple', model: 'iPhone 14 Pro Max', storage: '128GB', launchPrice: 139900, launchDate: '2022-09-16', basePriceExcellent: 70000, basePriceGood: 61000, basePriceAverage: 52000 },
  { brand: 'Apple', model: 'iPhone 14 Pro Max', storage: '256GB', launchPrice: 149900, launchDate: '2022-09-16', basePriceExcellent: 78000, basePriceGood: 68000, basePriceAverage: 58000 },
  { brand: 'Apple', model: 'iPhone 14 Pro', storage: '128GB', launchPrice: 129900, launchDate: '2022-09-16', basePriceExcellent: 60000, basePriceGood: 52000, basePriceAverage: 44000 },
  { brand: 'Apple', model: 'iPhone 14', storage: '128GB', launchPrice: 79900, launchDate: '2022-09-16', basePriceExcellent: 42000, basePriceGood: 38000, basePriceAverage: 33000 },
  { brand: 'Apple', model: 'iPhone 14', storage: '256GB', launchPrice: 89900, launchDate: '2022-09-16', basePriceExcellent: 47000, basePriceGood: 43000, basePriceAverage: 37000 },
  { brand: 'Apple', model: 'iPhone 13 Pro Max', storage: '128GB', launchPrice: 129900, launchDate: '2021-09-24', basePriceExcellent: 48000, basePriceGood: 42000, basePriceAverage: 35000 },
  { brand: 'Apple', model: 'iPhone 13', storage: '128GB', launchPrice: 79900, launchDate: '2021-09-24', basePriceExcellent: 32000, basePriceGood: 29000, basePriceAverage: 25000 },
  { brand: 'Apple', model: 'iPhone 13', storage: '256GB', launchPrice: 89900, launchDate: '2021-09-24', basePriceExcellent: 36000, basePriceGood: 33000, basePriceAverage: 28000 },
  { brand: 'Apple', model: 'iPhone 12', storage: '64GB', launchPrice: 65900, launchDate: '2020-10-23', basePriceExcellent: 24000, basePriceGood: 21000, basePriceAverage: 17000 },
  { brand: 'Apple', model: 'iPhone 12', storage: '128GB', launchPrice: 72900, launchDate: '2020-10-23', basePriceExcellent: 27000, basePriceGood: 24000, basePriceAverage: 19000 },
  { brand: 'Apple', model: 'iPhone 11', storage: '64GB', launchPrice: 68300, launchDate: '2019-09-20', basePriceExcellent: 17000, basePriceGood: 15000, basePriceAverage: 12000 },
  { brand: 'Apple', model: 'iPhone SE (2022)', storage: '64GB', launchPrice: 43900, launchDate: '2022-03-18', basePriceExcellent: 18000, basePriceGood: 15000, basePriceAverage: 12000 },

  // ─── Samsung Galaxy S Series ─────────────────────────────────
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB', launchPrice: 129999, launchDate: '2024-01-31', basePriceExcellent: 90000, basePriceGood: 79000, basePriceAverage: 68000 },
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '512GB', launchPrice: 149999, launchDate: '2024-01-31', basePriceExcellent: 105000, basePriceGood: 92000, basePriceAverage: 79000 },
  { brand: 'Samsung', model: 'Galaxy S24+', storage: '256GB', launchPrice: 99999, launchDate: '2024-01-31', basePriceExcellent: 68000, basePriceGood: 59000, basePriceAverage: 50000 },
  { brand: 'Samsung', model: 'Galaxy S24', storage: '128GB', launchPrice: 74999, launchDate: '2024-01-31', basePriceExcellent: 48000, basePriceGood: 42000, basePriceAverage: 35000 },
  { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', launchPrice: 84999, launchDate: '2024-01-31', basePriceExcellent: 55000, basePriceGood: 48000, basePriceAverage: 40000 },
  { brand: 'Samsung', model: 'Galaxy S23 Ultra', storage: '256GB', launchPrice: 124999, launchDate: '2023-02-17', basePriceExcellent: 68000, basePriceGood: 59000, basePriceAverage: 50000 },
  { brand: 'Samsung', model: 'Galaxy S23+', storage: '256GB', launchPrice: 94999, launchDate: '2023-02-17', basePriceExcellent: 48000, basePriceGood: 41000, basePriceAverage: 34000 },
  { brand: 'Samsung', model: 'Galaxy S23', storage: '128GB', launchPrice: 74999, launchDate: '2023-02-17', basePriceExcellent: 35000, basePriceGood: 31000, basePriceAverage: 26000 },
  { brand: 'Samsung', model: 'Galaxy S23', storage: '256GB', launchPrice: 79999, launchDate: '2023-02-17', basePriceExcellent: 38000, basePriceGood: 34000, basePriceAverage: 29000 },
  { brand: 'Samsung', model: 'Galaxy S22 Ultra', storage: '256GB', launchPrice: 109999, launchDate: '2022-02-25', basePriceExcellent: 45000, basePriceGood: 38000, basePriceAverage: 32000 },
  { brand: 'Samsung', model: 'Galaxy S22', storage: '128GB', launchPrice: 72999, launchDate: '2022-02-25', basePriceExcellent: 25000, basePriceGood: 21000, basePriceAverage: 17000 },
  { brand: 'Samsung', model: 'Galaxy S21 FE', storage: '128GB', launchPrice: 49999, launchDate: '2022-01-07', basePriceExcellent: 18000, basePriceGood: 15000, basePriceAverage: 12000 },
  // Samsung A & M Series
  { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '128GB', launchPrice: 34999, launchDate: '2024-03-22', basePriceExcellent: 22000, basePriceGood: 19000, basePriceAverage: 15000 },
  { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '256GB', launchPrice: 38999, launchDate: '2024-03-22', basePriceExcellent: 25000, basePriceGood: 21000, basePriceAverage: 17000 },
  { brand: 'Samsung', model: 'Galaxy A35 5G', storage: '128GB', launchPrice: 26999, launchDate: '2024-03-22', basePriceExcellent: 16000, basePriceGood: 14000, basePriceAverage: 11000 },
  { brand: 'Samsung', model: 'Galaxy A54 5G', storage: '128GB', launchPrice: 38999, launchDate: '2023-03-24', basePriceExcellent: 20000, basePriceGood: 17000, basePriceAverage: 14000 },
  { brand: 'Samsung', model: 'Galaxy A34 5G', storage: '128GB', launchPrice: 30999, launchDate: '2023-03-24', basePriceExcellent: 14000, basePriceGood: 12000, basePriceAverage: 9500 },
  { brand: 'Samsung', model: 'Galaxy A15 5G', storage: '128GB', launchPrice: 21999, launchDate: '2023-12-01', basePriceExcellent: 10000, basePriceGood: 8500, basePriceAverage: 7000 },
  { brand: 'Samsung', model: 'Galaxy A14', storage: '64GB', launchPrice: 13999, launchDate: '2023-02-10', basePriceExcellent: 6000, basePriceGood: 5000, basePriceAverage: 4000 },
  { brand: 'Samsung', model: 'Galaxy M55 5G', storage: '128GB', launchPrice: 29999, launchDate: '2024-04-10', basePriceExcellent: 17000, basePriceGood: 14500, basePriceAverage: 12000 },
  { brand: 'Samsung', model: 'Galaxy M35 5G', storage: '128GB', launchPrice: 21999, launchDate: '2024-07-18', basePriceExcellent: 12000, basePriceGood: 10000, basePriceAverage: 8000 },

  // ─── OnePlus ─────────────────────────────────────────────────
  { brand: 'OnePlus', model: 'OnePlus 12', storage: '256GB', launchPrice: 64999, launchDate: '2024-01-23', basePriceExcellent: 42000, basePriceGood: 36000, basePriceAverage: 30000 },
  { brand: 'OnePlus', model: 'OnePlus 12', storage: '512GB', launchPrice: 74999, launchDate: '2024-01-23', basePriceExcellent: 50000, basePriceGood: 43000, basePriceAverage: 36000 },
  { brand: 'OnePlus', model: 'OnePlus 12R', storage: '128GB', launchPrice: 39999, launchDate: '2024-01-23', basePriceExcellent: 24000, basePriceGood: 20000, basePriceAverage: 16000 },
  { brand: 'OnePlus', model: 'OnePlus 12R', storage: '256GB', launchPrice: 44999, launchDate: '2024-01-23', basePriceExcellent: 28000, basePriceGood: 23000, basePriceAverage: 19000 },
  { brand: 'OnePlus', model: 'OnePlus 11', storage: '128GB', launchPrice: 56999, launchDate: '2023-02-07', basePriceExcellent: 28000, basePriceGood: 24000, basePriceAverage: 19000 },
  { brand: 'OnePlus', model: 'OnePlus 11', storage: '256GB', launchPrice: 61999, launchDate: '2023-02-07', basePriceExcellent: 32000, basePriceGood: 27000, basePriceAverage: 22000 },
  { brand: 'OnePlus', model: 'OnePlus 11R', storage: '128GB', launchPrice: 39999, launchDate: '2023-02-07', basePriceExcellent: 18000, basePriceGood: 15000, basePriceAverage: 12000 },
  { brand: 'OnePlus', model: 'OnePlus Nord 4', storage: '256GB', launchPrice: 35999, launchDate: '2024-07-24', basePriceExcellent: 22000, basePriceGood: 18000, basePriceAverage: 15000 },
  { brand: 'OnePlus', model: 'OnePlus Nord CE 4', storage: '128GB', launchPrice: 24999, launchDate: '2024-04-01', basePriceExcellent: 14000, basePriceGood: 12000, basePriceAverage: 9500 },
  { brand: 'OnePlus', model: 'OnePlus Nord CE 3 Lite', storage: '128GB', launchPrice: 19999, launchDate: '2023-04-04', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 6000 },

  // ─── Xiaomi / Redmi / POCO ───────────────────────────────────
  { brand: 'Xiaomi', model: 'Xiaomi 14', storage: '256GB', launchPrice: 69999, launchDate: '2024-02-26', basePriceExcellent: 45000, basePriceGood: 39000, basePriceAverage: 32000 },
  { brand: 'Xiaomi', model: 'Xiaomi 14 Ultra', storage: '512GB', launchPrice: 99999, launchDate: '2024-05-20', basePriceExcellent: 68000, basePriceGood: 59000, basePriceAverage: 50000 },
  { brand: 'Xiaomi', model: 'Xiaomi 13 Pro', storage: '256GB', launchPrice: 79999, launchDate: '2023-03-09', basePriceExcellent: 35000, basePriceGood: 30000, basePriceAverage: 24000 },
  { brand: 'Redmi', model: 'Redmi Note 13 Pro+', storage: '256GB', launchPrice: 31999, launchDate: '2024-01-04', basePriceExcellent: 18000, basePriceGood: 15000, basePriceAverage: 12000 },
  { brand: 'Redmi', model: 'Redmi Note 13 Pro', storage: '128GB', launchPrice: 23999, launchDate: '2024-01-04', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'Redmi', model: 'Redmi Note 13 Pro', storage: '256GB', launchPrice: 26999, launchDate: '2024-01-04', basePriceExcellent: 15000, basePriceGood: 12500, basePriceAverage: 10000 },
  { brand: 'Redmi', model: 'Redmi Note 13', storage: '128GB', launchPrice: 16999, launchDate: '2024-01-04', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 6000 },
  { brand: 'Redmi', model: 'Redmi Note 12 Pro+', storage: '256GB', launchPrice: 28999, launchDate: '2023-01-05', basePriceExcellent: 12000, basePriceGood: 10000, basePriceAverage: 8000 },
  { brand: 'Redmi', model: 'Redmi Note 12 Pro', storage: '128GB', launchPrice: 22999, launchDate: '2023-01-05', basePriceExcellent: 10000, basePriceGood: 8500, basePriceAverage: 6500 },
  { brand: 'Redmi', model: 'Redmi Note 12', storage: '128GB', launchPrice: 17999, launchDate: '2023-01-05', basePriceExcellent: 7500, basePriceGood: 6500, basePriceAverage: 5000 },
  { brand: 'Redmi', model: 'Redmi 13C', storage: '128GB', launchPrice: 10999, launchDate: '2023-12-14', basePriceExcellent: 5500, basePriceGood: 4500, basePriceAverage: 3500 },
  { brand: 'POCO', model: 'POCO X6 Pro', storage: '256GB', launchPrice: 26999, launchDate: '2024-01-11', basePriceExcellent: 16000, basePriceGood: 13500, basePriceAverage: 11000 },
  { brand: 'POCO', model: 'POCO X6', storage: '256GB', launchPrice: 23999, launchDate: '2024-01-11', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'POCO', model: 'POCO M6 Pro', storage: '128GB', launchPrice: 18999, launchDate: '2024-03-04', basePriceExcellent: 9500, basePriceGood: 8000, basePriceAverage: 6500 },
  { brand: 'POCO', model: 'POCO F5 Pro', storage: '256GB', launchPrice: 46999, launchDate: '2023-05-09', basePriceExcellent: 21000, basePriceGood: 18000, basePriceAverage: 14000 },
  { brand: 'POCO', model: 'POCO F5', storage: '128GB', launchPrice: 29999, launchDate: '2023-05-09', basePriceExcellent: 14000, basePriceGood: 12000, basePriceAverage: 9500 },
  { brand: 'POCO', model: 'POCO F4', storage: '128GB', launchPrice: 27999, launchDate: '2022-06-27', basePriceExcellent: 10000, basePriceGood: 8500, basePriceAverage: 7000 },

  // ─── Realme ───────────────────────────────────────────────────
  { brand: 'Realme', model: 'Realme GT 6', storage: '256GB', launchPrice: 41999, launchDate: '2024-07-02', basePriceExcellent: 26000, basePriceGood: 22000, basePriceAverage: 18000 },
  { brand: 'Realme', model: 'Realme GT 5 Pro', storage: '256GB', launchPrice: 53999, launchDate: '2024-01-24', basePriceExcellent: 30000, basePriceGood: 26000, basePriceAverage: 21000 },
  { brand: 'Realme', model: 'Realme 12 Pro+', storage: '256GB', launchPrice: 29999, launchDate: '2024-02-14', basePriceExcellent: 17000, basePriceGood: 14000, basePriceAverage: 11000 },
  { brand: 'Realme', model: 'Realme 12 Pro', storage: '128GB', launchPrice: 25999, launchDate: '2024-02-14', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 9000 },
  { brand: 'Realme', model: 'Realme 12 Pro', storage: '256GB', launchPrice: 27999, launchDate: '2024-02-14', basePriceExcellent: 15000, basePriceGood: 12500, basePriceAverage: 10000 },
  { brand: 'Realme', model: 'Realme 12', storage: '128GB', launchPrice: 15999, launchDate: '2024-01-30', basePriceExcellent: 8500, basePriceGood: 7000, basePriceAverage: 5500 },
  { brand: 'Realme', model: 'Realme 11 Pro+', storage: '256GB', launchPrice: 27999, launchDate: '2023-07-10', basePriceExcellent: 12000, basePriceGood: 10000, basePriceAverage: 8000 },
  { brand: 'Realme', model: 'Realme 11 Pro', storage: '128GB', launchPrice: 24999, launchDate: '2023-07-10', basePriceExcellent: 10000, basePriceGood: 8500, basePriceAverage: 6500 },
  { brand: 'Realme', model: 'Realme 11x 5G', storage: '128GB', launchPrice: 16999, launchDate: '2023-07-21', basePriceExcellent: 7500, basePriceGood: 6500, basePriceAverage: 5000 },
  { brand: 'Realme', model: 'Realme 10 Pro+', storage: '128GB', launchPrice: 24999, launchDate: '2022-12-09', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 6000 },
  { brand: 'Realme', model: 'Realme 10 Pro+', storage: '256GB', launchPrice: 26999, launchDate: '2022-12-09', basePriceExcellent: 10000, basePriceGood: 8500, basePriceAverage: 6500 },
  { brand: 'Realme', model: 'Realme 10 Pro', storage: '128GB', launchPrice: 20999, launchDate: '2022-12-09', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 5000 },
  { brand: 'Realme', model: 'Realme 10', storage: '128GB', launchPrice: 15999, launchDate: '2022-11-09', basePriceExcellent: 6500, basePriceGood: 5500, basePriceAverage: 4200 },
  { brand: 'Realme', model: 'Realme 10 4G', storage: '128GB', launchPrice: 14999, launchDate: '2022-11-09', basePriceExcellent: 5500, basePriceGood: 4500, basePriceAverage: 3500 },
  { brand: 'Realme', model: 'Realme Narzo 60 Pro', storage: '128GB', launchPrice: 27999, launchDate: '2023-07-10', basePriceExcellent: 12000, basePriceGood: 10000, basePriceAverage: 8000 },
  { brand: 'Realme', model: 'Realme Narzo 60x 5G', storage: '128GB', launchPrice: 14999, launchDate: '2023-09-26', basePriceExcellent: 6500, basePriceGood: 5500, basePriceAverage: 4200 },
  { brand: 'Realme', model: 'Realme C67 5G', storage: '128GB', launchPrice: 17999, launchDate: '2023-11-02', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 5000 },
  { brand: 'Realme', model: 'Realme C55', storage: '128GB', launchPrice: 11999, launchDate: '2023-03-09', basePriceExcellent: 5000, basePriceGood: 4200, basePriceAverage: 3300 },
  { brand: 'Realme', model: 'Realme 9 Pro+', storage: '128GB', launchPrice: 24999, launchDate: '2022-02-16', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 5000 },
  { brand: 'Realme', model: 'Realme 9 Pro', storage: '128GB', launchPrice: 19999, launchDate: '2022-02-16', basePriceExcellent: 7000, basePriceGood: 5800, basePriceAverage: 4500 },

  // ─── Vivo ─────────────────────────────────────────────────────
  { brand: 'Vivo', model: 'Vivo X100 Pro', storage: '256GB', launchPrice: 89999, launchDate: '2024-01-17', basePriceExcellent: 58000, basePriceGood: 50000, basePriceAverage: 42000 },
  { brand: 'Vivo', model: 'Vivo X100', storage: '256GB', launchPrice: 63999, launchDate: '2024-01-17', basePriceExcellent: 40000, basePriceGood: 34000, basePriceAverage: 28000 },
  { brand: 'Vivo', model: 'Vivo V30 Pro', storage: '256GB', launchPrice: 44999, launchDate: '2024-03-14', basePriceExcellent: 27000, basePriceGood: 23000, basePriceAverage: 19000 },
  { brand: 'Vivo', model: 'Vivo V30', storage: '128GB', launchPrice: 33999, launchDate: '2024-03-14', basePriceExcellent: 19000, basePriceGood: 16000, basePriceAverage: 13000 },
  { brand: 'Vivo', model: 'Vivo T3 Pro 5G', storage: '128GB', launchPrice: 23999, launchDate: '2024-06-13', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'Vivo', model: 'Vivo T3 5G', storage: '128GB', launchPrice: 21999, launchDate: '2024-04-12', basePriceExcellent: 11000, basePriceGood: 9500, basePriceAverage: 7500 },
  { brand: 'Vivo', model: 'Vivo Y200 5G', storage: '128GB', launchPrice: 22999, launchDate: '2023-11-01', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 7000 },
  { brand: 'Vivo', model: 'Vivo Y100A', storage: '128GB', launchPrice: 17999, launchDate: '2023-08-09', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 5000 },

  // ─── OPPO ─────────────────────────────────────────────────────
  { brand: 'OPPO', model: 'OPPO Find X7 Ultra', storage: '512GB', launchPrice: 99999, launchDate: '2024-03-18', basePriceExcellent: 65000, basePriceGood: 56000, basePriceAverage: 47000 },
  { brand: 'OPPO', model: 'OPPO Reno 12 Pro', storage: '256GB', launchPrice: 36999, launchDate: '2024-07-12', basePriceExcellent: 22000, basePriceGood: 18000, basePriceAverage: 15000 },
  { brand: 'OPPO', model: 'OPPO Reno 12', storage: '256GB', launchPrice: 32999, launchDate: '2024-07-12', basePriceExcellent: 19000, basePriceGood: 16000, basePriceAverage: 12000 },
  { brand: 'OPPO', model: 'OPPO Reno 11 Pro', storage: '256GB', launchPrice: 39999, launchDate: '2024-01-12', basePriceExcellent: 20000, basePriceGood: 17000, basePriceAverage: 13000 },
  { brand: 'OPPO', model: 'OPPO Reno 11', storage: '128GB', launchPrice: 32999, launchDate: '2024-01-12', basePriceExcellent: 16000, basePriceGood: 13000, basePriceAverage: 10000 },
  { brand: 'OPPO', model: 'OPPO F25 Pro 5G', storage: '128GB', launchPrice: 26999, launchDate: '2024-02-07', basePriceExcellent: 14000, basePriceGood: 12000, basePriceAverage: 9500 },
  { brand: 'OPPO', model: 'OPPO A78 5G', storage: '128GB', launchPrice: 22999, launchDate: '2023-04-11', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 6000 },

  // ─── Google Pixel ─────────────────────────────────────────────
  { brand: 'Google', model: 'Pixel 9 Pro XL', storage: '256GB', launchPrice: 129999, launchDate: '2024-08-22', basePriceExcellent: 88000, basePriceGood: 76000, basePriceAverage: 64000 },
  { brand: 'Google', model: 'Pixel 9 Pro', storage: '128GB', launchPrice: 109999, launchDate: '2024-08-22', basePriceExcellent: 72000, basePriceGood: 62000, basePriceAverage: 52000 },
  { brand: 'Google', model: 'Pixel 9', storage: '128GB', launchPrice: 79999, launchDate: '2024-08-22', basePriceExcellent: 52000, basePriceGood: 44000, basePriceAverage: 37000 },
  { brand: 'Google', model: 'Pixel 8 Pro', storage: '128GB', launchPrice: 106999, launchDate: '2023-10-12', basePriceExcellent: 55000, basePriceGood: 47000, basePriceAverage: 39000 },
  { brand: 'Google', model: 'Pixel 8', storage: '128GB', launchPrice: 75999, launchDate: '2023-10-12', basePriceExcellent: 42000, basePriceGood: 36000, basePriceAverage: 29000 },
  { brand: 'Google', model: 'Pixel 7a', storage: '128GB', launchPrice: 53999, launchDate: '2023-05-11', basePriceExcellent: 25000, basePriceGood: 21000, basePriceAverage: 17000 },

  // ─── Motorola ─────────────────────────────────────────────────
  { brand: 'Motorola', model: 'Motorola Edge 50 Ultra', storage: '512GB', launchPrice: 59999, launchDate: '2024-05-23', basePriceExcellent: 36000, basePriceGood: 30000, basePriceAverage: 25000 },
  { brand: 'Motorola', model: 'Motorola Edge 50 Pro', storage: '256GB', launchPrice: 31999, launchDate: '2024-04-03', basePriceExcellent: 19000, basePriceGood: 16000, basePriceAverage: 13000 },
  { brand: 'Motorola', model: 'Motorola Edge 50 Fusion', storage: '128GB', launchPrice: 22999, launchDate: '2024-05-15', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'Motorola', model: 'Moto G85 5G', storage: '128GB', launchPrice: 19999, launchDate: '2024-08-15', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 7000 },
  { brand: 'Motorola', model: 'Moto G84 5G', storage: '256GB', launchPrice: 20999, launchDate: '2023-09-28', basePriceExcellent: 10000, basePriceGood: 8500, basePriceAverage: 6500 },
  { brand: 'Motorola', model: 'Moto G64 5G', storage: '128GB', launchPrice: 15999, launchDate: '2024-04-15', basePriceExcellent: 8000, basePriceGood: 6500, basePriceAverage: 5000 },

  // ─── iQOO ─────────────────────────────────────────────────────
  { brand: 'iQOO', model: 'iQOO 12', storage: '256GB', launchPrice: 52999, launchDate: '2024-01-10', basePriceExcellent: 32000, basePriceGood: 27000, basePriceAverage: 22000 },
  { brand: 'iQOO', model: 'iQOO 11', storage: '256GB', launchPrice: 59999, launchDate: '2023-01-10', basePriceExcellent: 24000, basePriceGood: 20000, basePriceAverage: 16000 },
  { brand: 'iQOO', model: 'iQOO Neo 9 Pro', storage: '256GB', launchPrice: 36999, launchDate: '2024-02-05', basePriceExcellent: 21000, basePriceGood: 18000, basePriceAverage: 14000 },
  { brand: 'iQOO', model: 'iQOO Neo 7 Pro', storage: '256GB', launchPrice: 36999, launchDate: '2023-09-08', basePriceExcellent: 16000, basePriceGood: 13500, basePriceAverage: 11000 },
  { brand: 'iQOO', model: 'iQOO Z9 5G', storage: '128GB', launchPrice: 22999, launchDate: '2024-04-04', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 8500 },
  { brand: 'iQOO', model: 'iQOO Z9s Pro 5G', storage: '256GB', launchPrice: 29999, launchDate: '2024-09-02', basePriceExcellent: 18000, basePriceGood: 15000, basePriceAverage: 12000 },

  // ─── Nothing ──────────────────────────────────────────────────
  { brand: 'Nothing', model: 'Nothing Phone (2a)', storage: '128GB', launchPrice: 23999, launchDate: '2024-03-05', basePriceExcellent: 14000, basePriceGood: 12000, basePriceAverage: 9500 },
  { brand: 'Nothing', model: 'Nothing Phone (2a)', storage: '256GB', launchPrice: 27999, launchDate: '2024-03-05', basePriceExcellent: 16000, basePriceGood: 13500, basePriceAverage: 11000 },
  { brand: 'Nothing', model: 'Nothing Phone (2)', storage: '128GB', launchPrice: 44999, launchDate: '2023-07-11', basePriceExcellent: 22000, basePriceGood: 18000, basePriceAverage: 15000 },
  { brand: 'Nothing', model: 'Nothing Phone (2)', storage: '256GB', launchPrice: 49999, launchDate: '2023-07-11', basePriceExcellent: 25000, basePriceGood: 21000, basePriceAverage: 17000 },
  { brand: 'Nothing', model: 'Nothing Phone (1)', storage: '128GB', launchPrice: 32999, launchDate: '2022-07-12', basePriceExcellent: 13000, basePriceGood: 11000, basePriceAverage: 8500 },

  // ─── Infinix / Tecno ──────────────────────────────────────────
  { brand: 'Infinix', model: 'Infinix GT 20 Pro', storage: '256GB', launchPrice: 21999, launchDate: '2024-06-12', basePriceExcellent: 11000, basePriceGood: 9000, basePriceAverage: 7000 },
  { brand: 'Infinix', model: 'Infinix Note 40 Pro', storage: '256GB', launchPrice: 21999, launchDate: '2024-04-05', basePriceExcellent: 10500, basePriceGood: 8500, basePriceAverage: 6500 },
  { brand: 'Infinix', model: 'Infinix Zero 30 5G', storage: '256GB', launchPrice: 23999, launchDate: '2023-11-20', basePriceExcellent: 9000, basePriceGood: 7500, basePriceAverage: 5800 },
  { brand: 'Tecno', model: 'Tecno Phantom X2 Pro', storage: '256GB', launchPrice: 44999, launchDate: '2023-01-09', basePriceExcellent: 15000, basePriceGood: 12500, basePriceAverage: 9500 },
  { brand: 'Tecno', model: 'Tecno Spark 20 Pro+', storage: '256GB', launchPrice: 13999, launchDate: '2024-01-09', basePriceExcellent: 6500, basePriceGood: 5200, basePriceAverage: 4000 },

  // ─── Nokia ────────────────────────────────────────────────────
  { brand: 'Nokia', model: 'Nokia G42 5G', storage: '128GB', launchPrice: 14999, launchDate: '2023-09-12', basePriceExcellent: 6500, basePriceGood: 5500, basePriceAverage: 4200 },
  { brand: 'Nokia', model: 'Nokia C32', storage: '64GB', launchPrice: 9999, launchDate: '2023-07-26', basePriceExcellent: 4000, basePriceGood: 3200, basePriceAverage: 2500 },

  // ─── Honor ────────────────────────────────────────────────────
  { brand: 'Honor', model: 'Honor 200 Pro', storage: '256GB', launchPrice: 64999, launchDate: '2024-06-20', basePriceExcellent: 40000, basePriceGood: 34000, basePriceAverage: 28000 },
  { brand: 'Honor', model: 'Honor 200', storage: '256GB', launchPrice: 39999, launchDate: '2024-06-20', basePriceExcellent: 23000, basePriceGood: 19000, basePriceAverage: 15000 },
  { brand: 'Honor', model: 'Honor X9b 5G', storage: '256GB', launchPrice: 29999, launchDate: '2024-01-17', basePriceExcellent: 15000, basePriceGood: 12500, basePriceAverage: 10000 },
];

async function seed() {
  console.log(`\n🚀 Seeding ${devices.length} devices to MongoDB...\n`);

  let added = 0;
  let updated = 0;
  let failed = 0;

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

  console.log(`\n═══════════════════════════════════════`);
  console.log(`🎉 Done! Added: ${added} | Updated: ${updated} | Failed: ${failed}`);
  console.log(`═══════════════════════════════════════\n`);
  await prisma.$disconnect();
}

seed().catch(async err => {
  console.error('Seed crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
