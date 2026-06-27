// ─────────────────────────────────────────────────────────────────────────────
// Real Scraper + Seeder — scrapes GSMArena for ALL brands (old + new phones)
// Run: node scripts/scrape-and-seed.js
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const cheerio = require('cheerio');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const prisma = new PrismaClient();

// USD to INR conversion rate (update as needed)
const USD_TO_INR = 84;

// ─── Brand list: GSMArena brand slug → display name ─────────────────────────
const BRANDS = [
  { slug: 'apple-phones-48',    name: 'Apple' },
  { slug: 'samsung-phones-9',   name: 'Samsung' },
  { slug: 'oneplus-phones-95',  name: 'OnePlus' },
  { slug: 'xiaomi-phones-80',   name: 'Xiaomi' },
  { slug: 'realme-phones-118',  name: 'Realme' },
  { slug: 'oppo-phones-82',     name: 'OPPO' },
  { slug: 'vivo-phones-98',     name: 'Vivo' },
  { slug: 'google-phones-107',  name: 'Google' },
  { slug: 'motorola-phones-4',  name: 'Motorola' },
  { slug: 'nokia-phones-1',     name: 'Nokia' },
  { slug: 'nothing-phones-128', name: 'Nothing' },
  { slug: 'honor-phones-121',   name: 'Honor' },
  { slug: 'infinix-phones-119', name: 'Infinix' },
  { slug: 'asus-phones-46',     name: 'Asus' },
  { slug: 'iqoo-phones-155',    name: 'iQOO' },
  { slug: 'poco-phones-132',    name: 'POCO' },
];

// ─── HTTP helpers ────────────────────────────────────────────────────────────
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml',
};

async function fetchHTML(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      return res.data;
    } catch (err) {
      const isLast = i === retries - 1;
      const status = err.response?.status;
      console.warn(`  ⚠ Fetch failed (${status || err.code}) for ${url}${isLast ? '' : ' — retrying...'}`);
      if (!isLast) await sleep(4000 + i * 2000);
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Parse helpers ───────────────────────────────────────────────────────────

/** Convert "$ 709.69" or "€ 874.66" → INR (rough), return null if not found */
function parseUSDtoINR(priceText) {
  if (!priceText) return null;
  const m = priceText.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const usd = parseFloat(m[1].replace(/,/g, ''));
  return Math.round(usd * USD_TO_INR / 100) * 100;
}

/** Parse storage from internal memory spec, e.g. "128GB 8GB RAM" → ["128GB"] */
function parseStorages(internalText) {
  if (!internalText) return [];
  const variants = [];
  const parts = internalText.split(',').map(s => s.trim());
  for (const part of parts) {
    const m = part.match(/^(\d+(?:TB|GB))/i);
    if (m) {
      variants.push(m[1].toUpperCase());
    }
  }
  return [...new Set(variants)];
}

/** Parse announced date → YYYY-MM-DD (approx) */
function parseDate(announcedText) {
  if (!announcedText) return null;
  const m = announcedText.match(/(\d{4}),\s*(\w+)(?:\s+(\d+))?/);
  if (!m) return null;
  const year = m[1];
  const monthStr = m[2];
  const day = m[3] || '1';
  const months = {
    January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
    July:'07', August:'08', September:'09', October:'10', November:'11', December:'12',
  };
  const month = months[monthStr] || '01';
  return `${year}-${month}-${day.padStart(2,'0')}`;
}

/** Calculate buyback prices as % of launch price, degraded by age */
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

// ─── Scrape a single brand page (all pagination) ────────────────────────────
async function scrapeBrandPageLinks(brandSlug) {
  const links = [];
  let page = 1;
  while (true) {
    const url = page === 1
      ? `https://www.gsmarena.com/${brandSlug}.php`
      : `https://www.gsmarena.com/${brandSlug}-p${page}.php`;

    console.log(`  📄 Brand page ${page}: ${url}`);
    const html = await fetchHTML(url);
    if (!html) break;

    const $ = cheerio.load(html);

    const pageLinks = [];
    $('div.makers ul li a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.endsWith('.php') && !href.includes('price')) {
        pageLinks.push(`https://www.gsmarena.com/${href}`);
      }
    });

    if (pageLinks.length === 0) break;
    links.push(...pageLinks);

    const hasNext = $('a.pages-next').length > 0 || $('a[title="Next page"]').length > 0;
    if (!hasNext) break;

    page++;
    await sleep(1500);
  }
  return [...new Set(links)];
}

// ─── Scrape individual device page ──────────────────────────────────────────
async function scrapeDevicePage(url, brandName) {
  const html = await fetchHTML(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  let modelName = $('h1.specs-phone-name-title').text().trim();
  if (!modelName) modelName = $('h1').first().text().trim();
  if (!modelName) return [];

  // Skip non-phones
  const skipKeywords = ['iPad', 'Watch', 'AirPods', 'AirPod', 'HomePod', 'Mac', 'TV', 'Vision'];
  if (skipKeywords.some(kw => modelName.includes(kw))) return [];

  const specs = {};
  $('tr').each((_, row) => {
    const tds = $(row).find('td');
    if (tds.length >= 2) {
      const label = $(tds[0]).text().trim();
      const value = $(tds[1]).text().trim();
      if (label && value && label !== value) {
        if (!specs[label]) specs[label] = value;
      }
    }
  });

  const announced = specs['Announced'] || specs['Status'] || '';
  const launchDate = parseDate(announced);

  const internalRaw = specs['Internal'] || specs['Memory'] || '';
  let storages = parseStorages(internalRaw);
  if (storages.length === 0) storages = ['128GB'];

  const priceRaw = specs['Price'] || '';
  let launchPriceINR = parseUSDtoINR(priceRaw);

  if (!launchPriceINR) {
    const bodyText = $('body').text();
    const m = bodyText.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (m) {
      const usd = parseFloat(m[1].replace(/,/g, ''));
      launchPriceINR = Math.round(usd * USD_TO_INR / 100) * 100;
    }
  }

  if (!launchPriceINR) {
    const mn = modelName.toLowerCase();
    if (mn.includes('ultra') || mn.includes('pro max')) launchPriceINR = 99999;
    else if (mn.includes('pro')) launchPriceINR = 69999;
    else if (mn.includes('plus') || mn.includes('+')) launchPriceINR = 49999;
    else launchPriceINR = 29999;
  }

  for (const storage of storages) {
    let priceMult = 1.0;
    if (storage === '256GB') priceMult = 1.12;
    else if (storage === '512GB') priceMult = 1.28;
    else if (storage === '1TB') priceMult = 1.50;

    const scaledLaunch = Math.round(launchPriceINR * priceMult / 100) * 100;
    const buyback = calcBuybackPrices(scaledLaunch, launchDate);

    results.push({
      brand: brandName,
      model: modelName,
      storage,
      launchPrice: scaledLaunch,
      launchDate: launchDate || '2020-01-01',
      ...buyback,
    });
  }

  return results;
}

// ─── Main scrape + seed ──────────────────────────────────────────────────────
async function main() {
  console.log('\n🌐 WePickWeDrop — Real GSMArena Scraper + Seeder');
  console.log('='.repeat(55));

  const allDevices = [];

  for (const brand of BRANDS) {
    console.log(`\n📱 Scraping brand: ${brand.name} (${brand.slug})`);

    let deviceLinks;
    try {
      deviceLinks = await scrapeBrandPageLinks(brand.slug);
    } catch (err) {
      console.error(`  ❌ Failed to get device list for ${brand.name}: ${err.message}`);
      continue;
    }

    console.log(`  Found ${deviceLinks.length} device pages`);

    for (const link of deviceLinks) {
      try {
        const devices = await scrapeDevicePage(link, brand.name);
        if (devices.length > 0) {
          allDevices.push(...devices);
          for (const d of devices) {
            console.log(`  ✓ ${d.brand} ${d.model} (${d.storage}) — Rs${d.launchPrice.toLocaleString()}`);
          }
        }
      } catch (err) {
        console.warn(`  ⚠ Error scraping ${link}: ${err.message}`);
      }
      await sleep(1200);
    }

    await sleep(3000);
  }

  console.log(`\n\n📦 Total scraped: ${allDevices.length} device variants`);
  console.log('='.repeat(55));

  if (allDevices.length === 0) {
    console.error('❌ No devices scraped! Check network / GSMArena availability.');
    process.exit(1);
  }

  console.log('\n🚀 Seeding to MongoDB via Prisma...\n');

  let added = 0, updated = 0, failed = 0;

  for (const device of allDevices) {
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
      } else {
        await prisma.deviceMaster.create({
          data: { ...device, isActive: true },
        });
        added++;
      }
    } catch (err) {
      failed++;
      console.error(`  ❌ DB error for ${device.brand} ${device.model} (${device.storage}): ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(55));
  console.log(`Done!`);
  console.log(`  Added:   ${added}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${allDevices.length}`);
  console.log('='.repeat(55) + '\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Scraper crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
