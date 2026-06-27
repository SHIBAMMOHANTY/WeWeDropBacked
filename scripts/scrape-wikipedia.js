// ─────────────────────────────────────────────────────────────────────────────
// Real Scraper + Seeder (Wikipedia API version)
// Scrapes real phone lists dynamically without Cloudflare blocks!
// Run: node scripts/scrape-wikipedia.js
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const prisma = new PrismaClient();

// Configuration for Wikipedia API
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const HEADERS = {
  'User-Agent': 'WePickWeDrop-Scraper/1.0 (Contact: admin@wepickwedrop.com)'
};

// Depreciation logic for buyback prices
function calcBuybackPrices(launchPriceINR, launchYear) {
  const currentYear = new Date().getFullYear();
  const ageYears = Math.max(0, currentYear - launchYear);

  let excellentPct, goodPct, averagePct;
  if (ageYears === 0) {
    excellentPct = 0.75; goodPct = 0.65; averagePct = 0.55;
  } else if (ageYears === 1) {
    excellentPct = 0.65; goodPct = 0.55; averagePct = 0.45;
  } else if (ageYears === 2) {
    excellentPct = 0.50; goodPct = 0.42; averagePct = 0.35;
  } else if (ageYears === 3) {
    excellentPct = 0.38; goodPct = 0.32; averagePct = 0.25;
  } else if (ageYears === 4) {
    excellentPct = 0.28; goodPct = 0.23; averagePct = 0.18;
  } else {
    excellentPct = 0.18; goodPct = 0.14; averagePct = 0.10;
  }

  const round100 = (v) => Math.max(1000, Math.round(v / 100) * 100);
  return {
    basePriceExcellent: round100(launchPriceINR * excellentPct),
    basePriceGood:      round100(launchPriceINR * goodPct),
    basePriceAverage:   round100(launchPriceINR * averagePct),
  };
}

async function fetchWikiPageContent(pageTitle) {
  try {
    const res = await axios.get(WIKI_API, {
      headers: HEADERS,
      params: {
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: pageTitle,
        format: 'json',
        redirects: 1
      }
    });
    const pages = res.data.query.pages;
    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return '';
    return pages[pageId].revisions[0].slots.main['*'];
  } catch (err) {
    console.error(`Failed to fetch ${pageTitle}:`, err.message);
    return '';
  }
}

// Extract iPhones
async function scrapeApple() {
  console.log('\n📱 Scraping Apple devices from Wikipedia...');
  const content = await fetchWikiPageContent('List of iOS devices');
  const devices = [];
  
  const matches = content.matchAll(/!.*?\[\[(iPhone\s+[^\]\|]+).*?\]\].*?\|.*?(\d{4})/g);
  for (const match of matches) {
    let model = match[1].replace(/ \(.*?\)/, '').trim(); 
    let year = parseInt(match[2]);
    
    let basePrice = 79900;
    if (model.includes('Pro Max')) basePrice = 139900;
    else if (model.includes('Pro')) basePrice = 119900;
    else if (model.includes('Plus')) basePrice = 89900;
    else if (model.includes('SE') || model.includes('mini')) basePrice = 49900;

    devices.push({ brand: 'Apple', model, year, basePrice });
  }

  if (!devices.some(d => d.model.includes('16'))) {
    devices.push({ brand: 'Apple', model: 'iPhone 16 Pro Max', year: 2024, basePrice: 144900 });
    devices.push({ brand: 'Apple', model: 'iPhone 16 Pro', year: 2024, basePrice: 119900 });
    devices.push({ brand: 'Apple', model: 'iPhone 16 Plus', year: 2024, basePrice: 89900 });
    devices.push({ brand: 'Apple', model: 'iPhone 16', year: 2024, basePrice: 79900 });
  }

  return [...new Map(devices.map(item => [item.model, item])).values()];
}

// Extract Samsung Galaxy S and A series
async function scrapeSamsung() {
  console.log('\n📱 Scraping Samsung devices from Wikipedia...');
  let devices = [];
  
  const contentS = await fetchWikiPageContent('Samsung Galaxy S series');
  const matchesS = contentS.matchAll(/!.*?\[\[(Samsung Galaxy S\d+.*?)[\]\|].*?\|.*?(\d{4})/g);
  for (const match of matchesS) {
    let model = match[1].trim();
    let year = parseInt(match[2]);
    let basePrice = 74999;
    if (model.includes('Ultra')) basePrice = 124999;
    else if (model.includes('Plus') || model.includes('+')) basePrice = 94999;
    else if (model.includes('FE')) basePrice = 49999;
    devices.push({ brand: 'Samsung', model, year, basePrice });
  }

  const contentA = await fetchWikiPageContent('Samsung Galaxy A series');
  const matchesA = contentA.matchAll(/!.*?\[\[(Samsung Galaxy A\d+.*?)[\]\|].*?\|.*?(\d{4})/g);
  for (const match of matchesA) {
    let model = match[1].trim();
    let year = parseInt(match[2]);
    devices.push({ brand: 'Samsung', model, year, basePrice: 24999 });
  }

  return [...new Map(devices.map(item => [item.model, item])).values()];
}

// Generate variants for a model
function generateVariants(device) {
  const results = [];
  const storages = device.brand === 'Apple' ? ['128GB', '256GB', '512GB'] : ['128GB', '256GB'];
  
  for (const storage of storages) {
    let priceMult = 1.0;
    if (storage === '256GB') priceMult = 1.15;
    else if (storage === '512GB') priceMult = 1.35;
    
    const scaledLaunch = Math.round(device.basePrice * priceMult / 100) * 100;
    const buyback = calcBuybackPrices(scaledLaunch, device.year);

    results.push({
      brand: device.brand,
      model: device.model,
      storage,
      launchPrice: scaledLaunch,
      launchDate: `${device.year}-06-01`,
      ...buyback,
      isActive: true
    });
  }
  return results;
}

async function main() {
  console.log('🌐 WePickWeDrop — Real Wikipedia Scraper + Seeder');
  console.log('='.repeat(55));

  let rawDevices = [];
  
  const apples = await scrapeApple();
  console.log(`  Found ${apples.length} unique Apple models`);
  rawDevices.push(...apples);

  const samsungs = await scrapeSamsung();
  console.log(`  Found ${samsungs.length} unique Samsung models`);
  rawDevices.push(...samsungs);

  const otherBrands = [
    { brand: 'OnePlus', models: ['12', '12R', '11', '11R', '10 Pro', 'Nord 4', 'Nord CE 4'], year: 2024, base: 49999 },
    { brand: 'Xiaomi', models: ['14 Ultra', '14', '13 Pro', '13', '12 Pro'], year: 2024, base: 59999 },
    { brand: 'Google', models: ['Pixel 9 Pro XL', 'Pixel 9', 'Pixel 8 Pro', 'Pixel 8', 'Pixel 7a'], year: 2024, base: 79999 }
  ];

  for (const ob of otherBrands) {
    let y = ob.year;
    for (const m of ob.models) {
      rawDevices.push({ brand: ob.brand, model: ob.brand === 'Google' ? m : `${ob.brand} ${m}`, year: y, basePrice: ob.base });
      y = y > 2020 ? y - 1 : y; 
    }
  }

  const finalDevices = [];
  for (const d of rawDevices) {
    finalDevices.push(...generateVariants(d));
  }

  console.log(`\n📦 Total generated variants: ${finalDevices.length}`);
  console.log('='.repeat(55));

  if (finalDevices.length === 0) {
    console.log('❌ Failed to scrape data.');
    process.exit(1);
  }

  console.log('\n🚀 Seeding to MongoDB via Prisma...\n');
  
  let added = 0, updated = 0, failed = 0;
  for (const device of finalDevices) {
    try {
      const existing = await prisma.deviceMaster.findFirst({
        where: { brand: device.brand, model: device.model, storage: device.storage },
      });

      if (existing) {
        await prisma.deviceMaster.update({ where: { id: existing.id }, data: device });
        updated++;
      } else {
        await prisma.deviceMaster.create({ data: device });
        added++;
        console.log(`  ✅ Added: ${device.brand} ${device.model} (${device.storage})`);
      }
    } catch (err) {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(55));
  console.log(`🎉 Done! Added: ${added} | Updated: ${updated} | Failed: ${failed}`);
  console.log('='.repeat(55) + '\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('💥 Scraper crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
