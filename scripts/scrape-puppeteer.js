// ─────────────────────────────────────────────────────────────────────────────
// Real Scraper + Seeder (Puppeteer version) — scrapes GSMArena for ALL brands
// Run: node scripts/scrape-puppeteer.js
// ─────────────────────────────────────────────────────────────────────────────

const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const prisma = new PrismaClient();
const USD_TO_INR = 84;

const BRANDS = [
  { slug: 'apple-phones-48',    name: 'Apple' },
  { slug: 'samsung-phones-9',   name: 'Samsung' },
  { slug: 'oneplus-phones-95',  name: 'OnePlus' },
  { slug: 'xiaomi-phones-80',   name: 'Xiaomi' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function calcBuybackPrices(launchPriceINR, launchDateStr) {
  const now = new Date();
  const launched = launchDateStr ? new Date(launchDateStr) : now;
  const ageMonths = Math.max(0, (now - launched) / (1000 * 60 * 60 * 24 * 30));

  let excellentPct, goodPct, averagePct;
  if (ageMonths < 6) {
    excellentPct = 0.82; goodPct = 0.73; averagePct = 0.63;
  } else if (ageMonths < 12) {
    excellentPct = 0.72; goodPct = 0.63; averagePct = 0.54;
  } else if (ageMonths < 24) {
    excellentPct = 0.58; goodPct = 0.50; averagePct = 0.43;
  } else if (ageMonths < 36) {
    excellentPct = 0.44; goodPct = 0.37; averagePct = 0.31;
  } else if (ageMonths < 48) {
    excellentPct = 0.32; goodPct = 0.27; averagePct = 0.22;
  } else {
    excellentPct = 0.22; goodPct = 0.18; averagePct = 0.14;
  }

  const round100 = (v) => Math.max(1000, Math.round(v / 100) * 100);
  return {
    basePriceExcellent: round100(launchPriceINR * excellentPct),
    basePriceGood:      round100(launchPriceINR * goodPct),
    basePriceAverage:   round100(launchPriceINR * averagePct),
  };
}

async function main() {
  console.log('Launching Puppeteer (using local Chrome to avoid blocks)...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
  } catch (err) {
    console.log('Could not launch Chrome. Ensure Chrome is installed at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  const allDevices = [];

  for (const brand of BRANDS) {
    console.log(`\n📱 Scraping brand: ${brand.name}`);
    const url = `https://www.gsmarena.com/${brand.slug}.php`;
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      
      const isBlocked = await page.evaluate(() => {
        return document.body.innerText.includes('Too Many Requests') || document.body.innerText.includes('Cloudflare');
      });

      if (isBlocked) {
        console.log(`  ⚠ Blocked on ${brand.name} page. GSMArena is aggressively blocking us.`);
        continue;
      }

      const deviceLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div.makers ul li a'))
          .map(a => a.href)
          .filter(h => h.includes('.php') && !h.includes('price'))
          .slice(0, 5); 
      });

      console.log(`  Found ${deviceLinks.length} devices to scrape`);

      for (const link of deviceLinks) {
        try {
          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(1500);

          const specs = await page.evaluate(() => {
            const modelName = document.querySelector('h1.specs-phone-name-title')?.innerText?.trim() || '';
            const specRows = Array.from(document.querySelectorAll('table.specs-list tr'));
            const data = {};
            
            specRows.forEach(row => {
              const label = row.querySelector('.ttl a')?.innerText?.trim() || row.querySelector('th')?.innerText?.trim();
              const val = row.querySelector('.nfo')?.innerText?.trim();
              if (label && val) data[label] = val;
            });
            
            const bodyText = document.body.innerText;
            const priceMatch = bodyText.match(/\$\s*([\d,]+(?:\.\d+)?)/);
            
            return {
              modelName,
              announced: data['Announced'] || data['Status'] || '',
              internal: data['Internal'] || data['Memory'] || '',
              priceMatch: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null
            };
          });

          if (!specs.modelName) continue;
          if (['iPad', 'Watch', 'AirPods', 'Mac'].some(kw => specs.modelName.includes(kw))) continue;

          let launchPriceINR = 29999;
          if (specs.priceMatch) {
            launchPriceINR = Math.round(specs.priceMatch * USD_TO_INR / 100) * 100;
          } else if (specs.modelName.toLowerCase().includes('pro')) {
            launchPriceINR = 69999;
          }

          let storages = ['128GB'];
          const storageMatches = specs.internal.match(/\b(64|128|256|512|1024)GB\b/g);
          if (storageMatches) {
            storages = [...new Set(storageMatches.map(s => s.replace('1024GB','1TB')))];
          }

          let launchDateStr = '2022-01-01';
          const dateMatch = specs.announced.match(/(\d{4}),\s*(\w+)/);
          if (dateMatch) {
            const months = { January:'01', February:'02', March:'03', April:'04', May:'05', June:'06', July:'07', August:'08', September:'09', October:'10', November:'11', December:'12' };
            launchDateStr = `${dateMatch[1]}-${months[dateMatch[2]] || '01'}-01`;
          }

          for (const storage of storages) {
            let priceMult = 1.0;
            if (storage === '256GB') priceMult = 1.15;
            else if (storage === '512GB') priceMult = 1.35;
            else if (storage === '1TB') priceMult = 1.60;
            
            const scaledLaunch = Math.round(launchPriceINR * priceMult / 100) * 100;
            const buyback = calcBuybackPrices(scaledLaunch, launchDateStr);

            const deviceObj = {
              brand: brand.name,
              model: specs.modelName,
              storage,
              launchPrice: scaledLaunch,
              launchDate: launchDateStr,
              ...buyback
            };
            allDevices.push(deviceObj);
            console.log(`  ✓ ${deviceObj.brand} ${deviceObj.model} (${deviceObj.storage})`);
          }
        } catch (err) {
          console.warn(`  ⚠ Error on ${link}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Failed brand ${brand.name}: ${err.message}`);
    }
  }

  await browser.close();

  if (allDevices.length === 0) {
    console.log('\n❌ Could not scrape any devices. We might be completely blocked by Cloudflare.');
    process.exit(1);
  }

  console.log(`\n🚀 Seeding ${allDevices.length} scraped devices to DB...`);
  
  let added = 0, updated = 0;
  for (const device of allDevices) {
    const existing = await prisma.deviceMaster.findFirst({
      where: { brand: device.brand, model: device.model, storage: device.storage },
    });

    if (existing) {
      await prisma.deviceMaster.update({ where: { id: existing.id }, data: { ...device, isActive: true } });
      updated++;
    } else {
      await prisma.deviceMaster.create({ data: { ...device, isActive: true } });
      added++;
    }
  }
  
  console.log(`\n🎉 Done! Added: ${added}, Updated: ${updated}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Scraper crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
